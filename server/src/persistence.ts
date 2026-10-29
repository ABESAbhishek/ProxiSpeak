import mongoose from 'mongoose';
import type { UserData } from './roomManager';
import { UserModel } from './models/User';
import { AccountModel } from './models/Account';
import { AuthSessionModel } from './models/AuthSession';
import { EmailCodeModel } from './models/EmailCode';

const uri = process.env.MONGODB_URI?.trim();
const lastSaved = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export async function initializePersistence(): Promise<'mongo' | 'memory'> {
  if (!uri) {
    console.warn('[Persistence] MONGODB_URI is unset; using in-memory development mode.');
    return 'memory';
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await UserModel.createIndexes();
  await AccountModel.createIndexes();
  await AuthSessionModel.createIndexes();
  await EmailCodeModel.createIndexes();
  await UserModel.updateMany({ isActive: true }, {
    $set: { isActive: false, activitySummary: 'Session ended when the server restarted.', lastSeenAt: new Date() }
  });
  console.log('[Persistence] MongoDB connected and indexes ready.');
  return 'mongo';
}

export function persistUser(user: UserData, immediate = false, final = false): void {
  if (mongoose.connection.readyState !== 1) return;
  const elapsed = Date.now() - (lastSaved.get(user.id) ?? 0);
  if (immediate || elapsed >= 10_000) {
    const existing = pending.get(user.id);
    if (existing) clearTimeout(existing);
    pending.delete(user.id);
    lastSaved.set(user.id, Date.now());
    const write = save(user, final);
    if (final) void write.finally(() => lastSaved.delete(user.id));
    return;
  }
  if (!pending.has(user.id)) {
    pending.set(user.id, setTimeout(() => {
      pending.delete(user.id);
      lastSaved.set(user.id, Date.now());
      void save(user);
    }, 10_000 - elapsed));
  }
}

async function save(user: UserData, final = false) {
  // Map the office's planar pixel bounds to valid world longitude/latitude
  // only to prepare a GeoJSON index. Spatial queries must use pixel x/y.
  const longitude = (user.position.x / 1000) * 360 - 180;
  const latitude = (user.position.y / 560) * 180 - 90;
  try {
    await UserModel.updateOne({ socketId: user.id }, {
      $set: {
        socketId: user.id, accountId: user.accountId, displayName: user.username, avatarUrl: user.avatarUrl || '', officeId: user.roomId,
        x: user.position.x, y: user.position.y,
        location: { type: 'Point', coordinates: [longitude, latitude] },
        lastSeenAt: new Date(user.lastActivityAt),
        isActive: !final,
        activitySummary: user.activitySummary,
        isMuted: Boolean(user.isMuted),
        isSpeaking: Boolean(user.isSpeaking)
      }
    }, { upsert: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown database error';
    console.error(`[Persistence] Could not save presence: ${message}`);
  }
}

export async function closePersistence() {
  pending.forEach(clearTimeout);
  pending.clear();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
