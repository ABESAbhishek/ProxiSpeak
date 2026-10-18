import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'socket.io';
import { roomManager } from './roomManager';
import { persistUser } from './persistence';
import { AccountModel, AccountRecord } from './models/Account';
import { AuthSessionModel, AuthSessionRecord } from './models/AuthSession';
import { EmailCodeModel } from './models/EmailCode';

const scrypt = (password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number }) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived as Buffer));
});
const router = Router();
const wrapAsync = (handler: RequestHandler): RequestHandler => handler.constructor.name !== 'AsyncFunction' ? handler : (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
for (const method of ['get', 'post', 'patch'] as const) {
  const register = router[method].bind(router) as (...args: unknown[]) => Router;
  (router as unknown as Record<string, (...args: unknown[]) => Router>)[method] = (...args) => register(args[0], ...args.slice(1).map((handler) => wrapAsync(handler as RequestHandler)));
}
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(value => value.trim());
router.use((req, res, next) => {
  if (['POST', 'PATCH'].includes(req.method) && (!req.headers.origin || !allowedOrigins.includes(req.headers.origin))) return fail(res, 403, 'Request origin is not allowed.');
  next();
});
const COOKIE = 'proxispeak_session';
const SESSION_MS = Math.max(5, Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES) || 30) * 60_000;
const WARN_MS = Math.min(SESSION_MS - 60_000, Math.max(1, Number(process.env.SESSION_WARNING_MINUTES) || 28) * 60_000);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sessionHash = (value: string) => createHmac('sha256', process.env.SESSION_SECRET || 'missing-session-secret').update(value).digest('hex');
const emailOf = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const emailProviderReady = () => Boolean(process.env.OTP_SECRET && process.env.OTP_SECRET.length >= 32 && process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const fail = (res: Response, status: number, message: string) => res.status(status).json({ error: message });
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicProfile = (account: AccountRecord & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }) => ({
  id: account._id.toString(), fullName: account.fullName, username: account.username,
  email: account.email, avatarUrl: account.avatarUrl, bio: account.bio, jobTitle: account.jobTitle,
  team: account.team, emailVerified: account.emailVerified, authProviders: account.authProviders,
  createdAt: account.createdAt, updatedAt: account.updatedAt
});
type AuthedRequest = Request & { auth?: { account: AccountRecord & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }; session: AuthSessionRecord & { _id: Types.ObjectId } } };
const cookieValue = (req: Request) => req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
const cookieOptions = (maxAge: number) => `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
async function issueSession(res: Response, accountId: Types.ObjectId) {
  await AuthSessionModel.deleteMany({ accountId, expiresAt: { $lte: new Date() } });
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  await AuthSessionModel.create({ accountId, tokenHash: sessionHash(token), lastActivityAt: now, expiresAt: new Date(now.getTime() + SESSION_MS) });
  await AccountModel.updateOne({ _id: accountId }, { $set: { lastSeenAt: now } });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOptions(SESSION_MS)}`);
}
export async function authenticateSocketCookie(cookieHeader?: string) {
  const token = cookieHeader?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const session = await AuthSessionModel.findOne({ tokenHash: sessionHash(decodeURIComponent(token)), expiresAt: { $gt: new Date() } });
  if (!session || Date.now() - session.lastActivityAt.getTime() >= SESSION_MS) {
    if (session) await AuthSessionModel.deleteOne({ _id: session._id });
    return null;
  }
  return { accountId: session.accountId.toString(), sessionId: session._id.toString() };
}
export const authRouter = router;
let socketServer: Server | null = null;
export function setAuthSocketServer(server: Server) { socketServer = server; }
function revokeSocketSession(sessionId: string) { socketServer?.in(`session:${sessionId}`).disconnectSockets(true); }
function publishAccountProfile(accountId: string, fullName: string, avatarUrl: string) {
  if (!socketServer) return;
  socketServer.sockets.sockets.forEach((socket) => {
    if (socket.data.accountId !== accountId) return;
    const live = roomManager.getUser(socket.id);
    if (!live) return;
    const updated = roomManager.updateProfile(socket.id, { username: fullName, avatarUrl });
    if (updated) {
      persistUser(updated, true);
      socketServer?.to(updated.roomId).emit('user:update-profile', { userId: socket.id, username: updated.username, avatarUrl: updated.avatarUrl });
    }
  });
}

async function loadAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = cookieValue(req);
    if (!token) return fail(res, 401, 'Please sign in to continue.');
    const session = await AuthSessionModel.findOne({ tokenHash: sessionHash(decodeURIComponent(token)), expiresAt: { $gt: new Date() } });
    if (!session || Date.now() - session.lastActivityAt.getTime() >= SESSION_MS) {
      if (session) await AuthSessionModel.deleteOne({ _id: session._id });
      res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions(0)}`);
      return fail(res, 401, 'Your session has expired. Please sign in again.');
    }
    const account = await AccountModel.findById(session.accountId).lean() as (AccountRecord & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }) | null;
    if (!account) return fail(res, 401, 'Please sign in to continue.');
    req.auth = { account, session: session.toObject() as AuthedRequest['auth'] extends { session: infer S } ? S : never };
    next();
  } catch { fail(res, 503, 'Authentication service is temporarily unavailable.'); }
}
export const requiredAuth = (req: Request, res: Response, next: NextFunction) => { void loadAuth(req as AuthedRequest, res, next); };

const attempts = new Map<string, { count: number; start: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `${req.path}:${req.ip}`; const now = Date.now(); const current = attempts.get(key);
  if (!current || now - current.start > 15 * 60_000) attempts.set(key, { count: 1, start: now });
  else if (current.count >= 12) return fail(res, 429, 'Too many attempts. Please wait and try again.');
  else current.count++;
  next();
}
router.use(rateLimit);
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) return fail(res, 503, 'Account sign-in requires a configured and available MongoDB database.');
  if ((!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) && req.path !== '/google') return fail(res, 503, 'Session security is not configured. Set SESSION_SECRET to at least 32 random characters.');
  next();
});

async function deliverCode(email: string, purpose: string) {
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32 || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  const now = Date.now();
  const recent = await EmailCodeModel.findOne({ email, purpose, sentAt: { $gt: new Date(now - 60_000) } });
  if (recent) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await EmailCodeModel.deleteMany({ email, purpose });
  await EmailCodeModel.create({ email, purpose, codeHash: hash(`${process.env.OTP_SECRET}:${email}:${code}`), sentAt: new Date(), expiresAt: new Date(now + 5 * 60_000) });
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM;
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: email, subject: 'Your ProxiSpeak verification code', text: `Your verification code is ${code}. It expires in 5 minutes.` }) });
  if (!response.ok) { await EmailCodeModel.deleteMany({ email, purpose }); throw new Error('EMAIL_DELIVERY_FAILED'); }
  return true;
}
async function verifyCode(email: string, purpose: string, code: string) {
  const record = await EmailCodeModel.findOne({ email, purpose, expiresAt: { $gt: new Date() } });
  if (!record || record.attempts >= 5) return false;
  record.attempts++;
  const actual = Buffer.from(hash(`${process.env.OTP_SECRET || ''}:${email}:${code}`));
  const expected = Buffer.from(record.codeHash);
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (valid) await record.deleteOne(); else await record.save();
  return valid;
}

router.post('/register', async (req, res) => {
  const rawName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''; const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const fullName = cleanText(rawName, 32); const username = cleanText(rawUsername, 24); const email = emailOf(req.body?.email); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!rawName || rawName.length > 32 || /[\u0000-\u001f\u007f-\u009f]/.test(rawName) || !/^[a-z0-9_]{3,24}$/.test(rawUsername) || !validEmail(email) || password.length < 10 || password.length > 200) return fail(res, 400, 'Enter a printable name (up to 32 characters), a username with 3–24 letters/numbers/underscores, a valid email, and a password of at least 10 characters.');
  if (!emailProviderReady()) return fail(res, 503, 'Email verification is not configured. Add OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM to the server environment.');
  let createdId: Types.ObjectId | undefined;
  try {
    const salt = randomBytes(16); const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }) as Buffer;
    const created = await AccountModel.create({ fullName, username, email, passwordHash: `scrypt$16384$${salt.toString('hex')}$${derived.toString('hex')}`, emailVerified: false, authProviders: ['password'] }); createdId = created._id;
    await deliverCode(email, 'verify');
    res.status(201).json({ message: 'If the email can receive messages, a verification code has been sent.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (createdId) await AccountModel.deleteOne({ _id: createdId, emailVerified: false });
    if (message === 'EMAIL_PROVIDER_NOT_CONFIGURED') return fail(res, 503, 'Email verification is not configured. Add OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM to the server environment.');
    if ((error as { code?: number }).code === 11000) return fail(res, 409, 'Unable to create this account with those details.');
    fail(res, 500, 'Unable to complete registration right now.');
  }
});
router.post('/email/verify', async (req, res) => {
  const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6);
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, 'Enter your email and six-digit code.');
  if (!await verifyCode(email, 'verify', code)) return fail(res, 400, 'That code is invalid or expired. Request a new one.');
  const account = await AccountModel.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  if (!account) return fail(res, 400, 'That code is invalid or expired. Request a new one.');
  await issueSession(res, account._id); res.json({ user: publicProfile(account as never) });
});
router.post('/email/verify/request', async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!emailProviderReady()) return fail(res, 503, 'Email verification needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.');
  const account = await AccountModel.findOne({ email, emailVerified: false });
  try { if (account) await deliverCode(email, 'verify'); res.json({ message: 'If an unverified account exists, a verification code has been sent.' }); }
  catch { fail(res, 503, 'Email verification could not send a code. Configure OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM.'); }
});
router.post('/email/otp/request', async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!emailProviderReady()) return fail(res, 503, 'Email sign-in needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.');
  try {
    const account = await AccountModel.findOne({ email, emailVerified: true });
    if (account) await deliverCode(email, 'login');
    res.json({ message: 'If an eligible account exists, a sign-in code has been sent.' });
  } catch (error) { fail(res, error instanceof Error && error.message === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 503 : 502, error instanceof Error && error.message === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 'Email sign-in needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.' : 'Email sign-in is temporarily unavailable.'); }
});
router.post('/email/otp/verify', async (req, res) => {
  const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6);
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, 'Enter your email and six-digit code.');
  const valid = await verifyCode(email, 'login', code); const account = valid ? await AccountModel.findOne({ email, emailVerified: true }) : null;
  if (!account) return fail(res, 401, 'The code is invalid or expired.');
  await issueSession(res, account._id); res.json({ user: publicProfile(account as never) });
});
router.post('/password/recovery/request', async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!emailProviderReady()) return fail(res, 503, 'Password recovery needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.');
  try { const account = await AccountModel.findOne({ email, emailVerified: true, passwordHash: { $exists: true } }).select('+passwordHash'); if (account) await deliverCode(email, 'password-reset'); res.json({ message: 'If an eligible account exists, a recovery code has been sent.' }); }
  catch (error) { if (error instanceof Error && error.message === 'EMAIL_PROVIDER_NOT_CONFIGURED') return fail(res, 503, 'Password recovery needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.'); res.json({ message: 'If an eligible account exists, a recovery code has been sent.' }); }
});
router.post('/password/recovery/complete', async (req, res) => {
  const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email) || !/^\d{6}$/.test(code) || password.length < 10 || password.length > 200) return fail(res, 400, 'Enter a valid email, six-digit code, and password of at least 10 characters.');
  if (!await verifyCode(email, 'password-reset', code)) return fail(res, 400, 'That code is invalid or expired.');
  const account = await AccountModel.findOne({ email, emailVerified: true }); if (!account) return fail(res, 400, 'That code is invalid or expired.');
  const salt = randomBytes(16); const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }) as Buffer; account.passwordHash = `scrypt$16384$${salt.toString('hex')}$${derived.toString('hex')}`; await account.save();
  const revoked = await AuthSessionModel.find({ accountId: account._id }).select('_id').lean(); await AuthSessionModel.deleteMany({ accountId: account._id }); revoked.forEach(session => revokeSocketSession(session._id.toString())); res.json({ ok: true });
});

async function verifyPassword(candidate: string, encoded?: string) {
  if (!encoded) return false;
  const [kind, cost, saltHex, keyHex] = encoded.split('$'); if (kind !== 'scrypt' || !saltHex || !keyHex) return false;
  const actual = await scrypt(candidate, Buffer.from(saltHex, 'hex'), 64, { N: Number(cost), r: 8, p: 1 }) as Buffer;
  const expected = Buffer.from(keyHex, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected);
}
router.post('/login', async (req, res) => {
  const identity = cleanText(req.body?.identity, 254).toLowerCase(); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!identity || !password) return fail(res, 400, 'Enter your username or email and password.');
  const account = await AccountModel.findOne({ $or: [{ email: identity }, { username: identity }] }).select('+passwordHash');
  if (!account || !account.emailVerified || !await verifyPassword(password, account.passwordHash)) return fail(res, 401, 'Sign-in failed. Check your details or verify your email.');
  await issueSession(res, account._id); res.json({ user: publicProfile(account as never) });
});
router.get('/me', requiredAuth, (req, res) => { const auth = (req as AuthedRequest).auth!; const idleMs = Date.now() - auth.session.lastActivityAt.getTime(); res.json({ user: publicProfile(auth.account), session: { expiresAt: auth.session.expiresAt, idleMs, warnInMs: Math.max(0, WARN_MS - idleMs), expiresInMs: Math.max(0, SESSION_MS - idleMs), idleTimeoutMs: SESSION_MS, warningMs: WARN_MS } }); });
router.post('/activity', requiredAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth!; const now = new Date();
  if (now.getTime() - auth.session.lastActivityAt.getTime() < 45_000) return res.json({ ok: true, expiresAt: auth.session.expiresAt });
  auth.session.lastActivityAt = now; auth.session.expiresAt = new Date(now.getTime() + SESSION_MS); await AuthSessionModel.updateOne({ _id: auth.session._id }, { $set: { lastActivityAt: now, expiresAt: auth.session.expiresAt } });
  res.json({ ok: true, expiresAt: auth.session.expiresAt });
});
router.post('/logout', requiredAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth!; await AuthSessionModel.deleteOne({ _id: auth.session._id });
  revokeSocketSession(auth.session._id.toString());
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions(0)}`); res.json({ ok: true });
});
router.patch('/profile', requiredAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth!; const patch = req.body && typeof req.body === 'object' ? req.body : {};
  const updates: Record<string, string> = {};
  for (const field of ['fullName', 'avatarUrl', 'bio', 'jobTitle', 'team'] as const) if (field in patch) {
    const max = field === 'bio' || field === 'avatarUrl' ? 500 : field === 'fullName' ? 32 : 80;
    const raw = typeof patch[field] === 'string' ? patch[field].trim() : '';
    if (raw.length > max || (field === 'fullName' && (!raw || /[\u0000-\u001f\u007f-\u009f]/.test(raw)))) return fail(res, 400, `Invalid ${field}.`);
    updates[field] = raw;
  }
  if ('username' in patch) { const raw = typeof patch.username === 'string' ? patch.username.trim().toLowerCase() : ''; const username = cleanText(raw, 24); if (raw.length > 24 || !/^[a-z0-9_]{3,24}$/.test(raw)) return fail(res, 400, 'Username must be 3–24 letters, numbers, or underscores.'); updates.username = username; }
  if ('email' in patch) return fail(res, 400, 'Email changes require a separate verification flow.');
  try {
    const account = await AccountModel.findByIdAndUpdate(auth.account._id, { $set: updates }, { new: true, runValidators: true });
    if (account && (typeof updates.fullName === 'string' || typeof updates.avatarUrl === 'string')) publishAccountProfile(account._id.toString(), account.fullName, account.avatarUrl || '');
    res.json({ user: publicProfile(account as never) });
  }
  catch (error) { if ((error as { code?: number }).code === 11000) return fail(res, 409, 'That username is already in use.'); fail(res, 400, 'Profile could not be updated.'); }
});
router.post('/email/change/request', requiredAuth, async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  const auth = (req as AuthedRequest).auth!;
  if (email === auth.account.email || await AccountModel.exists({ email })) return fail(res, 409, 'Unable to use that email address.');
  try { await deliverCode(email, `change-email:${auth.account._id}`); res.json({ message: 'If the address can receive mail, a verification code has been sent.' }); }
  catch (error) { fail(res, 503, error instanceof Error && error.message === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 'Email verification needs OTP_SECRET, RESEND_API_KEY, and EMAIL_FROM configured.' : 'Could not send a verification code.'); }
});
router.post('/email/change/verify', requiredAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth!; const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6);
  if (!validEmail(email) || !/^\d{6}$/.test(code) || !await verifyCode(email, `change-email:${auth.account._id}`, code)) return fail(res, 400, 'That code is invalid or expired.');
  try { const account = await AccountModel.findByIdAndUpdate(auth.account._id, { $set: { email, emailVerified: true } }, { new: true, runValidators: true }); if (!account) return fail(res, 404, 'Account not found.'); res.json({ user: publicProfile(account as never) }); }
  catch (error) { if ((error as { code?: number }).code === 11000) return fail(res, 409, 'Unable to use that email address.'); fail(res, 400, 'Email could not be updated.'); }
});
router.post('/password/change', requiredAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth!; const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''; const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const account = await AccountModel.findById(auth.account._id).select('+passwordHash');
  if (!account?.passwordHash || !await verifyPassword(current, account.passwordHash)) return fail(res, 401, 'Current password is incorrect.');
  if (next.length < 10 || next.length > 200) return fail(res, 400, 'Use a password between 10 and 200 characters.');
  const salt = randomBytes(16); const derived = await scrypt(next, salt, 64, { N: 16384, r: 8, p: 1 }) as Buffer; account.passwordHash = `scrypt$16384$${salt.toString('hex')}$${derived.toString('hex')}`; await account.save();
  const revoked = await AuthSessionModel.find({ accountId: account._id, _id: { $ne: auth.session._id } }).select('_id').lean();
  await AuthSessionModel.deleteMany({ accountId: account._id, _id: { $ne: auth.session._id } }); revoked.forEach(session => revokeSocketSession(session._id.toString())); res.json({ ok: true });
});

const oauthStates = new Map<string, number>();
router.get('/google', (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CALLBACK_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CALLBACK_URL) return fail(res, 503, 'Google sign-in is not configured.');
  const state = randomBytes(24).toString('base64url'); oauthStates.set(state, Date.now() + 5 * 60_000); res.setHeader('Set-Cookie', `proxispeak_oauth_state=${state}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=300${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth'); url.search = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_CALLBACK_URL, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString(); res.redirect(url.toString());
});
router.get('/google/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : ''; const validState = oauthStates.get(state); oauthStates.delete(state);
  const base = process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const stateCookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('proxispeak_oauth_state='))?.split('=').slice(1).join('=');
  res.setHeader('Set-Cookie', `proxispeak_oauth_state=; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  if (!validState || validState < Date.now() || stateCookie !== state || typeof req.query.code !== 'string') return res.redirect(`${base}/?authError=google`);
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: process.env.GOOGLE_CALLBACK_URL || '', grant_type: 'authorization_code' }) });
    if (!tokenResponse.ok) throw new Error('Google token exchange failed'); const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error('Missing Google access token');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error('Google user verification failed'); const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    const email = emailOf(profile.email); if (!profile.sub || !validEmail(email) || profile.email_verified !== true) throw new Error('Google account email is not verified');
    let account = await AccountModel.findOne({ email });
    if (account) { if (!account.authProviders.includes('google')) account.authProviders.push('google'); account.emailVerified = true; account.lastSeenAt = new Date(); await account.save(); }
    else {
      const baseName = (email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'member').replace(/^_+|_+$/g, '') || 'member'; let username = baseName.length < 3 ? `${baseName}_01` : baseName; let suffix = 1;
      while (await AccountModel.exists({ username })) username = `${baseName.slice(0, 20)}_${suffix++}`.slice(0, 24);
      account = await AccountModel.create({ fullName: cleanText(profile.name || baseName, 32) || baseName, username, email, avatarUrl: cleanText(profile.picture, 500), authProviders: ['google'], emailVerified: true });
    }
    await issueSession(res, account._id); res.redirect(base);
  } catch { res.redirect(`${base}/?authError=google`); }
});
