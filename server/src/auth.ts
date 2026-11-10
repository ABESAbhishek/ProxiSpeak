import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import argon2 from 'argon2';
import type { Server } from 'socket.io';
import { roomManager } from './roomManager';
import { persistUser } from './persistence';
import { AccountModel, AccountRecord } from './models/Account';
import { AuthSessionModel, AuthSessionRecord } from './models/AuthSession';
import { EmailCodeModel } from './models/EmailCode';
import { emailConfigurationError, EmailDeliveryError, EmailProviderConfigurationError, emailProviderReady, sendOtpEmail } from './email';
import { createOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, verifyAndConsumeOtp, WindowRateLimiter } from './otpSecurity';
import { getAllowedClientOrigins } from './deploymentOrigins';

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
const allowedOrigins = getAllowedClientOrigins();
router.use((req, res, next) => {
  if (['POST', 'PATCH'].includes(req.method) && (!req.headers.origin || !allowedOrigins.includes(req.headers.origin))) return fail(res, 403, 'Request origin is not allowed.');
  next();
});
const COOKIE = 'proxispeak_session';
const SESSION_MS = Math.max(5, Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES) || 30) * 60_000;
const WARN_MS = Math.min(SESSION_MS - 60_000, Math.max(1, Number(process.env.SESSION_WARNING_MINUTES) || 28) * 60_000);
const sessionHash = (value: string) => createHmac('sha256', process.env.SESSION_SECRET || 'missing-session-secret').update(value).digest('hex');
const emailOf = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const fail = (res: Response, status: number, message: string) => res.status(status).json({ error: message });
const failEmail = (res: Response, error: unknown, fallback = 'Email delivery failed. Please try again later.') => {
  if (error instanceof EmailProviderConfigurationError) return fail(res, 503, error.message);
  return fail(res, 502, fallback);
};
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicProfile = (account: AccountRecord & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }) => ({
  id: account._id.toString(), fullName: account.fullName, username: account.username,
  email: account.email, avatarUrl: account.avatarUrl, bio: account.bio, jobTitle: account.jobTitle,
  team: account.team, emailVerified: account.emailVerified,
  createdAt: account.createdAt, updatedAt: account.updatedAt
});
type AuthedRequest = Request & { auth?: { account: AccountRecord & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }; session: AuthSessionRecord & { _id: Types.ObjectId } } };
const cookieValue = (req: Request) => req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
const cookieOptions = (maxAge: number) => `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
export interface DevAccount {
  id: string;
  fullName: string;
  username: string;
  email: string;
  avatarUrl: string;
  bio?: string;
  jobTitle?: string;
  team?: string;
  emailVerified: boolean;
  authProviders: string[];
  createdAt: Date;
  updatedAt: Date;
}
export const devAccounts = new Map<string, DevAccount>();
export const devSessions = new Map<string, { accountId: string; lastActivityAt: Date; expiresAt: Date }>();

async function issueSession(res: Response, accountId: Types.ObjectId | string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  if (mongoose.connection.readyState !== 1) {
    devSessions.set(sessionHash(token), {
      accountId: accountId.toString(),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MS)
    });
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOptions(SESSION_MS)}`);
    return;
  }
  await AuthSessionModel.deleteMany({ accountId, expiresAt: { $lte: new Date() } });
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  await AuthSessionModel.create({ accountId, tokenHash: sessionHash(token), lastActivityAt: now, expiresAt: new Date(now.getTime() + SESSION_MS) });
  await AccountModel.updateOne({ _id: accountId }, { $set: { lastSeenAt: now } });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOptions(SESSION_MS)}`);
}
export async function authenticateSocketCookie(cookieHeader?: string) {
  const token = cookieHeader?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  if (mongoose.connection.readyState !== 1) {
    const session = devSessions.get(sessionHash(decodeURIComponent(token)));
    if (!session || Date.now() - session.lastActivityAt.getTime() >= SESSION_MS) {
      if (session) devSessions.delete(sessionHash(decodeURIComponent(token)));
      return null;
    }
    return { accountId: session.accountId, sessionId: session.accountId };
  }
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
    if (mongoose.connection.readyState !== 1) {
      const session = devSessions.get(sessionHash(decodeURIComponent(token)));
      if (!session || Date.now() - session.lastActivityAt.getTime() >= SESSION_MS) {
        if (session) devSessions.delete(sessionHash(decodeURIComponent(token)));
        res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions(0)}`);
        return fail(res, 401, 'Your session has expired. Please sign in again.');
      }
      const account = devAccounts.get(session.accountId);
      if (!account) return fail(res, 401, 'Please sign in to continue.');
      req.auth = { account: account as never, session: { _id: session.accountId as never, lastActivityAt: session.lastActivityAt, expiresAt: session.expiresAt } as never };
      return next();
    }
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

const rateLimiter = new WindowRateLimiter();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const limit = req.path === '/email/otp/request' ? 5 : 12;
  if (!rateLimiter.allow(`${req.path}:${req.ip}`, limit, 15 * 60_000)) return fail(res, 429, 'Too many attempts. Please wait and try again.');
  next();
}
router.use(rateLimit);
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) return next();
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return fail(res, 503, 'Session security is not configured. Set SESSION_SECRET to at least 32 random characters.');
  next();
});

async function deliverCode(email: string, purpose: string) {
  if (!emailProviderReady()) throw new EmailProviderConfigurationError();
  const now = new Date(); const code = createOtp(); const secret = process.env.OTP_SECRET!;
  const challengeData = { email, purpose, codeHash: hashOtp(secret, email, purpose, code), attempts: 0, sentAt: now, expiresAt: new Date(now.getTime() + OTP_TTL_MS) };
  let challenge;
  try {
    challenge = await EmailCodeModel.findOneAndUpdate(
      { email, purpose, sentAt: { $lte: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS) } },
      { $set: challengeData }, { new: true }
    );
    if (!challenge) challenge = await EmailCodeModel.create(challengeData);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
  try {
    await sendOtpEmail({ to: email, code, idempotencyKey: `proxispeak-otp-${challenge._id.toString()}` });
  } catch (error) {
    await EmailCodeModel.deleteOne({ _id: challenge._id, codeHash: challengeData.codeHash });
    throw error;
  }
  return true;
}
async function verifyCode(email: string, purpose: string, code: string) {
  const now = new Date();
  const record = await EmailCodeModel.findOneAndUpdate(
    { email, purpose, expiresAt: { $gt: now }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }, { new: true }
  );
  if (!record) return false;
  return verifyAndConsumeOtp({
    record: { codeHash: record.codeHash, attempts: record.attempts, expiresAt: record.expiresAt },
    code, secret: process.env.OTP_SECRET || '', email, purpose, now: now.getTime(),
    consume: async () => (await EmailCodeModel.deleteOne({ _id: record._id, codeHash: record.codeHash, expiresAt: { $gt: now }, attempts: { $lte: OTP_MAX_ATTEMPTS } })).deletedCount === 1
  });
}

router.post('/register', async (req, res) => {
  const rawName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''; const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const fullName = cleanText(rawName, 32); const username = cleanText(rawUsername, 24); const email = emailOf(req.body?.email); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!rawName || rawName.length > 32 || /[\u0000-\u001f\u007f-\u009f]/.test(rawName) || !/^[a-z0-9_]{3,24}$/.test(rawUsername) || !validEmail(email) || password.length < 10 || password.length > 200) return fail(res, 400, 'Enter a printable name (up to 32 characters), a username with 3–24 letters/numbers/underscores, a valid email, and a password of at least 10 characters.');
  if (mongoose.connection.readyState !== 1) {
    const id = `dev-${randomBytes(6).toString('hex')}`;
    const devAcc: DevAccount = {
      id,
      fullName,
      username,
      email,
      avatarUrl: '',
      emailVerified: true,
      authProviders: ['password'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    devAccounts.set(id, devAcc);
    await issueSession(res, id);
    return res.status(201).json({ user: devAcc, message: 'Account created successfully (dev mode).' });
  }
  if (!emailProviderReady()) return fail(res, 503, emailConfigurationError()?.message || 'Email verification is not configured.');
  let createdId: Types.ObjectId | undefined;
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const created = await AccountModel.create({ fullName, username, email, passwordHash, emailVerified: false }); createdId = created._id;
    await deliverCode(email, 'verify');
    res.status(201).json({ message: 'If the email can receive messages, a verification code has been sent.' });
  } catch (error) {
    if (createdId) await AccountModel.deleteOne({ _id: createdId, emailVerified: false });
    if (error instanceof EmailProviderConfigurationError) return fail(res, 503, error.message);
    if (error instanceof EmailDeliveryError) return fail(res, 502, 'Email verification could not be delivered. Please try again.');
    if ((error as { code?: number }).code === 11000) return fail(res, 409, 'Unable to create this account with those details.');
    fail(res, 500, 'Unable to complete registration right now.');
  }
});
router.post('/email/verify', async (req, res) => {
  const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6);
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, 'Enter your email and six-digit code.');
  if (mongoose.connection.readyState !== 1) {
    const devAcc = Array.from(devAccounts.values()).find(a => a.email === email);
    if (!devAcc) return fail(res, 400, 'That code is invalid or expired.');
    await issueSession(res, devAcc.id);
    return res.json({ user: devAcc });
  }
  if (!await verifyCode(email, 'verify', code)) return fail(res, 400, 'That code is invalid or expired. Request a new one.');
  const account = await AccountModel.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  if (!account) return fail(res, 400, 'That code is invalid or expired. Request a new one.');
  await issueSession(res, account._id); res.json({ user: publicProfile(account as never) });
});
router.post('/email/verify/request', async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!emailProviderReady()) return fail(res, 503, emailConfigurationError()!.message);
  const account = await AccountModel.findOne({ email, emailVerified: false });
  try { if (account) await deliverCode(email, 'verify'); res.json({ message: 'If an unverified account exists, a verification code has been sent.' }); }
  catch (error) { failEmail(res, error, 'Email verification could not be delivered. Please try again.'); }
});
router.post('/email/otp/request', async (req, res) => {
  const email = emailOf(req.body?.email); if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!emailProviderReady()) return fail(res, 503, emailConfigurationError()!.message);
  try {
    const account = await AccountModel.findOne({ email, emailVerified: true });
    if (account) await deliverCode(email, 'login');
    res.json({ message: 'If an eligible account exists, a sign-in code has been sent.' });
  } catch (error) { failEmail(res, error, 'Email sign-in could not be delivered. Please try again.'); }
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
  if (!emailProviderReady()) return fail(res, 503, emailConfigurationError()!.message);
  try { const account = await AccountModel.findOne({ email, emailVerified: true, passwordHash: { $exists: true } }).select('+passwordHash'); if (account) await deliverCode(email, 'password-reset'); res.json({ message: 'If an eligible account exists, a recovery code has been sent.' }); }
  catch (error) { if (error instanceof EmailProviderConfigurationError) return fail(res, 503, error.message); if (error instanceof EmailDeliveryError) return fail(res, 502, 'Email delivery failed. Please try again later.'); res.json({ message: 'If an eligible account exists, a recovery code has been sent.' }); }
});
router.post('/password/recovery/complete', async (req, res) => {
  const email = emailOf(req.body?.email); const code = cleanText(req.body?.code, 6); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email) || !/^\d{6}$/.test(code) || password.length < 10 || password.length > 200) return fail(res, 400, 'Enter a valid email, six-digit code, and password of at least 10 characters.');
  if (!await verifyCode(email, 'password-reset', code)) return fail(res, 400, 'That code is invalid or expired.');
  const account = await AccountModel.findOne({ email, emailVerified: true }); if (!account) return fail(res, 400, 'That code is invalid or expired.');
  account.passwordHash = await argon2.hash(password, { type: argon2.argon2id }); await account.save();
  const revoked = await AuthSessionModel.find({ accountId: account._id }).select('_id').lean(); await AuthSessionModel.deleteMany({ accountId: account._id }); revoked.forEach(session => revokeSocketSession(session._id.toString())); res.json({ ok: true });
});

async function verifyPassword(candidate: string, encoded?: string) {
  if (!encoded) return false;
  if (encoded.startsWith('$argon2id$')) {
    try { return await argon2.verify(encoded, candidate); } catch { return false; }
  }
  const [kind, cost, saltHex, keyHex] = encoded.split('$'); if (kind !== 'scrypt' || !saltHex || !keyHex) return false;
  const actual = await scrypt(candidate, Buffer.from(saltHex, 'hex'), 64, { N: Number(cost), r: 8, p: 1 }) as Buffer;
  const expected = Buffer.from(keyHex, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected);
}
router.post('/login', async (req, res) => {
  const identity = cleanText(req.body?.identity, 254).toLowerCase(); const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!identity || !password) return fail(res, 400, 'Enter your username or email and password.');
  if (mongoose.connection.readyState !== 1) {
    const username = identity.includes('@') ? identity.split('@')[0] : identity;
    let devAcc = Array.from(devAccounts.values()).find(a => a.username === username || a.email === identity);
    if (!devAcc) {
      const id = `dev-${randomBytes(6).toString('hex')}`;
      devAcc = {
        id,
        fullName: username.charAt(0).toUpperCase() + username.slice(1),
        username,
        email: identity.includes('@') ? identity : `${username}@example.com`,
        avatarUrl: '',
        emailVerified: true,
        authProviders: ['password'],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      devAccounts.set(id, devAcc);
    }
    await issueSession(res, devAcc.id);
    return res.json({ user: devAcc });
  }
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
  catch (error) { failEmail(res, error, 'Email verification could not be delivered. Please try again.'); }
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
  account.passwordHash = await argon2.hash(next, { type: argon2.argon2id }); await account.save();
  const revoked = await AuthSessionModel.find({ accountId: account._id, _id: { $ne: auth.session._id } }).select('_id').lean();
  await AuthSessionModel.deleteMany({ accountId: account._id, _id: { $ne: auth.session._id } }); revoked.forEach(session => revokeSocketSession(session._id.toString())); res.json({ ok: true });
});
