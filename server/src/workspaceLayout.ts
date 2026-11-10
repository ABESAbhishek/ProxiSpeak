import { Router, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'socket.io';
import { requiredAuth } from './auth';
import { OfficeLayoutModel } from './models/OfficeLayout';

type AuthedRequest = Request & { auth?: { account: { _id: Types.ObjectId } } };
const ROOM_ID = /^[\w-]{1,64}$/;
const numberIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

function parseLayout(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  if (!Array.isArray(body.furniture) || !Array.isArray(body.obstacles) || body.furniture.length > 100 || body.obstacles.length > 100) return null;
  const furniture = body.furniture.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || !/^[\w-]{1,64}$/.test(value.id) || !['desk', 'sofa', 'plant', 'table'].includes(String(value.type)) ||
      !numberIn(value.x, 0, 1000) || !numberIn(value.y, 0, 560) || !numberIn(value.width, 1, 1000) || !numberIn(value.depth, 1, 560) || !numberIn(value.rotation, -Math.PI * 2, Math.PI * 2) ||
      (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 48))) return null;
    return { id: value.id, type: value.type as 'desk' | 'sofa' | 'plant' | 'table', label: value.label as string | undefined, x: value.x as number, y: value.y as number, width: value.width as number, depth: value.depth as number, rotation: value.rotation as number };
  });
  const obstacles = body.obstacles.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || !/^[\w-]{1,64}$/.test(value.id) || !numberIn(value.x, 0, 1000) || !numberIn(value.y, 0, 560) || !numberIn(value.width, 1, 1000) || !numberIn(value.height, 1, 560) ||
      typeof value.blocksSound !== 'boolean' || !numberIn(value.soundDamping, 0, 1)) return null;
    return { id: value.id, x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number, blocksSound: value.blocksSound as boolean, soundDamping: value.soundDamping as number };
  });
  if (furniture.some((item) => !item) || obstacles.some((item) => !item)) return null;
  const ids = [...furniture, ...obstacles].map((item) => item!.id);
  if (new Set(ids).size !== ids.length) return null;
  return { furniture: furniture as NonNullable<typeof furniture[number]>[], obstacles: obstacles as NonNullable<typeof obstacles[number]>[] };
}

export function createWorkspaceLayoutRouter(io: Server) {
  const router = Router();
  router.use(requiredAuth);
  router.get('/:roomId', async (req, res) => {
    if (!ROOM_ID.test(req.params.roomId)) return fail(res, 400, 'Invalid room ID.');
    if (mongoose.connection.readyState !== 1) return fail(res, 503, 'Workspace storage is unavailable.');
    const layout = await OfficeLayoutModel.findOne({ roomId: req.params.roomId }).lean();
    res.json({ layout: layout ? { roomId: layout.roomId, revision: layout.revision, furniture: layout.furniture, obstacles: layout.obstacles } : null });
  });
  router.put('/:roomId', async (req, res) => {
    if (!ROOM_ID.test(req.params.roomId)) return fail(res, 400, 'Invalid room ID.');
    if (mongoose.connection.readyState !== 1) return fail(res, 503, 'Workspace storage is unavailable.');
    const parsed = parseLayout(req.body);
    if (!parsed) return fail(res, 400, 'Invalid office layout.');
    const accountId = (req as AuthedRequest).auth!.account._id;
    const existing = await OfficeLayoutModel.findOne({ roomId: req.params.roomId });
    if (existing && !existing.ownerId.equals(accountId)) return fail(res, 403, 'Only the workspace owner can update this layout.');
    const layout = existing
      ? await OfficeLayoutModel.findOneAndUpdate({ _id: existing._id }, { $set: parsed, $inc: { revision: 1 } }, { new: true, runValidators: true })
      : await OfficeLayoutModel.create({ roomId: req.params.roomId, ownerId: accountId, revision: 1, ...parsed });
    const published = { roomId: layout!.roomId, revision: layout!.revision, furniture: layout!.furniture, obstacles: layout!.obstacles };
    io.to(req.params.roomId).emit('workspace:layout', published);
    res.json({ layout: published });
  });
  return router;
}
