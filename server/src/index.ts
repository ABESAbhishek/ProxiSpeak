import './config';
import dns from 'node:dns';
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { registerWebRTCSignaling } from './signaling';
import { roomManager } from './roomManager';
import { closePersistence, initializePersistence, persistUser } from './persistence';
import mongoose from 'mongoose';
import { UserModel } from './models/User';
import { authRouter, authenticateSocketCookie, requiredAuth, setAuthSocketServer } from './auth';
import { AccountModel } from './models/Account';
import { AuthSessionModel } from './models/AuthSession';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const startTime = Date.now();
const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || CLIENT_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  next();
});
app.use('/api/auth', authRouter);

app.get('/health', (_req, res) => res.json({
  status: 'ok', service: 'ProxiSpeak Backend & Signaling Server',
  uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  activeUsers: roomManager.getTotalUsersCount(), activeRooms: roomManager.getRoomSummaries().length,
  persistence: process.env.MONGODB_URI ? 'configured' : 'disabled', timestamp: new Date().toISOString()
}));
app.get('/api/world', requiredAuth, (_req, res) => res.json({
  totalUsers: roomManager.getTotalUsersCount(),
  users: roomManager.getAllUsers().map(({ id, username, position, roomId, isMuted, avatarUrl }) => ({ id, username, position, roomId, isMuted, avatarUrl }))
}));
app.get('/api/rooms', requiredAuth, (_req, res) => res.json({ rooms: roomManager.getRoomSummaries() }));
app.get('/api/team', requiredAuth, async (_req, res, next) => {
  try {
    const activeByAccount = new Map<string, { id: string; displayName: string; avatarUrl: string; status: 'active'; roomId: string; summary: string; lastSeenAt: string; joinedAt: string; isMuted: boolean; isSpeaking: boolean; sessionCount: number }>();
    roomManager.getAllUsers().forEach((user) => {
      const id = user.accountId || user.id; const existing = activeByAccount.get(id);
      const current = { id, displayName: user.username, avatarUrl: user.avatarUrl || '', status: 'active' as const, roomId: user.roomId,
        summary: user.activitySummary, lastSeenAt: new Date(user.lastActivityAt).toISOString(), joinedAt: new Date(user.joinedAt).toISOString(),
        isMuted: Boolean(user.isMuted), isSpeaking: Boolean(user.isSpeaking), sessionCount: (existing?.sessionCount || 0) + 1 };
      if (!existing || Date.parse(current.lastSeenAt) > Date.parse(existing.lastSeenAt)) activeByAccount.set(id, current);
      else activeByAccount.set(id, { ...existing, sessionCount: current.sessionCount });
    });
    const active = Array.from(activeByAccount.values());
    const previousById = new Map<string, { id: string; displayName: string; avatarUrl: string; status: 'previous'; roomId: string; summary: string; lastSeenAt: string; joinedAt: string; isMuted: boolean; isSpeaking: boolean; sessionCount: number }>();
    roomManager.getRecentUsers().forEach((user) => {
      const id = user.accountId || user.id;
      if (!previousById.has(id)) previousById.set(id, { id, displayName: user.username, avatarUrl: user.avatarUrl || '', status: 'previous', roomId: user.roomId,
        summary: user.activitySummary, lastSeenAt: new Date(user.lastActivityAt).toISOString(), joinedAt: new Date(user.joinedAt).toISOString(),
        isMuted: Boolean(user.isMuted), isSpeaking: Boolean(user.isSpeaking), sessionCount: 1 });
    });
    if (mongoose.connection.readyState === 1) {
      const records = await UserModel.find({ isActive: false }).sort({ lastSeenAt: -1 }).limit(50).lean();
      records.forEach((record) => {
        const id = record.accountId || record.socketId;
        if (!previousById.has(id)) previousById.set(id, {
          id, displayName: record.displayName, avatarUrl: record.avatarUrl || '', status: 'previous' as const,
          roomId: record.officeId, summary: record.activitySummary,
          lastSeenAt: record.lastSeenAt.toISOString(), joinedAt: new Date(record.createdAt).toISOString(),
          isMuted: record.isMuted, isSpeaking: record.isSpeaking, sessionCount: 1
        });
      });
    }
    const activeIds = new Set(active.map((member) => member.id));
    const previous = Array.from(previousById.values())
      .filter((member) => !activeIds.has(member.id))
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))
      .slice(0, 50);
    res.json({ active, previous, persistence: mongoose.connection.readyState === 1 ? 'mongo' : 'memory' });
  } catch (error) {
    next(error);
  }
});
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[HTTP] ${error.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { ...corsOptions, credentials: true },
  pingInterval: 10000,
  pingTimeout: 5000
});
setAuthSocketServer(io);

io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (!origin || !CLIENT_ORIGINS.includes(origin)) return next(new Error('Origin is not allowed.'));
    if (mongoose.connection.readyState !== 1) return next(new Error('Account authentication requires MongoDB configuration.'));
    const identity = await authenticateSocketCookie(socket.handshake.headers.cookie);
    if (!identity) return next(new Error('Authentication required. Please sign in again.'));
    const account = await AccountModel.findById(identity.accountId).select('fullName username avatarUrl emailVerified');
    if (!account || !account.emailVerified) return next(new Error('Authentication required. Please sign in again.'));
    socket.data.accountId = identity.accountId;
    socket.data.authSessionId = identity.sessionId;
    socket.data.displayName = account.fullName;
    socket.data.username = account.username;
    socket.data.avatarUrl = account.avatarUrl || '';
    next();
  } catch { next(new Error('Authentication service is temporarily unavailable.')); }
});

type Position = { x: number; y: number; z: number };
const validPosition = (value: unknown): value is Position => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z ?? 0)
    && Number(point.x) >= 0 && Number(point.x) <= 1000
    && Number(point.y) >= 0 && Number(point.y) <= 560
    && Math.abs(Number(point.z ?? 0)) <= 50;
};
const validRoomId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
const authorizedRoomIds = new Set((process.env.AUTHORIZED_ROOM_IDS || roomManager.DEFAULT_ROOM).split(',').map((room) => room.trim()).filter(Boolean));
const fail = (socket: Socket, message: string) => socket.emit('server:error', { message });

io.on('connection', (socket: Socket) => {
  socket.join(`session:${socket.data.authSessionId}`);
  let movementTimes: number[] = [];

  socket.use((packet, next) => {
    void AuthSessionModel.findOne({ _id: socket.data.authSessionId, expiresAt: { $gt: new Date() } }).then((session) => {
      if (!session) { socket.disconnect(true); next(new Error('Session expired.')); return; }
      next();
    }).catch(() => { socket.disconnect(true); next(new Error('Authentication unavailable.')); });
  });

  socket.on('user:join', (data: unknown, acknowledge?: (result: { ok: boolean; userId?: string; roomId?: string; message?: string }) => void) => {
    const rejectJoin = (message: string) => {
      fail(socket, message);
      acknowledge?.({ ok: false, message });
    };
    if (!data || typeof data !== 'object') return rejectJoin('Invalid join payload.');
    const payload = data as Record<string, unknown>;
    const requestedName = typeof payload.username === 'string' ? payload.username.trim() :
      typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
    const username = typeof socket.data.displayName === 'string' ? socket.data.displayName : requestedName;
    const position = payload.position ?? { x: 500, y: 280, z: 0 };
    const roomId = payload.roomId ?? roomManager.DEFAULT_ROOM;
    if (!username || username.length > 32 || /[\u0000-\u001f\u007f-\u009f]/.test(username)) return rejectJoin('Display name must contain 1–32 printable characters.');
    if (!validPosition(position)) return rejectJoin('Position must be finite and within the 1000 × 560 world bounds.');
    if (!validRoomId(roomId)) return rejectJoin('Room ID must be 1–64 letters, numbers, underscores, or hyphens.');
    if (!authorizedRoomIds.has(roomId)) return rejectJoin('You are not authorized to join that room.');

    const existing = roomManager.getUser(socket.id);
    if (existing && existing.roomId !== roomId) {
      socket.leave(existing.roomId);
      socket.to(existing.roomId).emit('user:left', { userId: socket.id, roomId: existing.roomId });
    }
    const user = roomManager.addUser(socket.id, String(socket.data.accountId), username, { x: position.x, y: position.y, z: position.z ?? 0 }, roomId, String(socket.data.avatarUrl || ''));
    persistUser(user, true);
    socket.join(roomId);
    socket.emit('world:state', { roomId, users: roomManager.getUsersInRoom(roomId) });
    if (!existing || existing.roomId !== roomId) socket.to(roomId).emit('user:join', user);
    acknowledge?.({ ok: true, userId: socket.id, roomId });
  });

  socket.on('position:update', (data: unknown) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return fail(socket, 'Join a room before sending position updates.');
    const now = Date.now();
    movementTimes = movementTimes.filter((time) => now - time < 1000);
    if (movementTimes.length >= 30) return;
    movementTimes.push(now);
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const raw = payload.position ?? payload;
    if (!validPosition(raw)) return fail(socket, 'Position must be finite and within the 1000 × 560 world bounds.');
    const position = raw as Position;
    const updatedUser = roomManager.updatePosition(socket.id, { x: position.x, y: position.y, z: position.z ?? 0 });
    if (updatedUser) {
      persistUser(updatedUser);
      socket.to(updatedUser.roomId).emit('position:update', {
        userId: socket.id, position: updatedUser.position, roomId: updatedUser.roomId
      });
    }
  });

  socket.on('user:update-profile', (data: unknown) => {
    if (!roomManager.getUser(socket.id) || !data || typeof data !== 'object') return;
    const payload = data as Record<string, unknown>;
    const updates: { isMuted?: boolean; isSpeaking?: boolean; username?: string } = {};
    if (typeof payload.isMuted === 'boolean') updates.isMuted = payload.isMuted;
    if (typeof payload.isSpeaking === 'boolean') updates.isSpeaking = payload.isSpeaking;
    // Display names are loaded from the authenticated account; clients cannot rename themselves over signaling.
    const user = roomManager.updateProfile(socket.id, updates);
    if (user) {
      persistUser(user, true);
      socket.to(user.roomId).emit('user:update-profile', { userId: socket.id, isMuted: user.isMuted, isSpeaking: user.isSpeaking, username: user.username });
    }
  });

  socket.on('world:sync', () => {
    const user = roomManager.getUser(socket.id);
    if (user) socket.emit('world:state', { roomId: user.roomId, users: roomManager.getUsersInRoom(user.roomId) });
  });


  registerWebRTCSignaling(io, socket);
  socket.on('disconnect', () => {
    const user = roomManager.removeUser(socket.id);
    if (user) {
      persistUser(user, true, true);
      io.to(user.roomId).emit('user:left', { userId: socket.id, roomId: user.roomId });
    }
  });
});

const sessionSweepTimer = setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    const sessionId = socket.data.authSessionId as string | undefined;
    if (!sessionId) { socket.disconnect(true); return; }
    void AuthSessionModel.exists({ _id: sessionId, expiresAt: { $gt: new Date() } }).then((exists) => {
      if (!exists) socket.disconnect(true);
    }).catch(() => socket.disconnect(true));
  });
}, 15_000);
sessionSweepTimer.unref();

server.on('error', (error) => { console.error('[Server] HTTP server error:', error.message); process.exitCode = 1; });
function shutdown() {
  console.log('[Server] Shutting down...');
  clearInterval(sessionSweepTimer);
  io.close(() => { void closePersistence().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
dns.setServers(['8.8.8.8', '1.1.1.1']);
initializePersistence().then(() => {
  server.listen(PORT, () => console.log(`ProxiSpeak server listening on http://localhost:${PORT} (CORS: ${CLIENT_ORIGINS.join(', ')})`));
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown MongoDB connection error';
  console.error(`[Persistence] MongoDB is configured but unavailable: ${message}`);
  process.exitCode = 1;
});
