import { Schema, model, models, Types } from 'mongoose';
export interface AuthSessionRecord { accountId: Types.ObjectId; tokenHash: string; lastActivityAt: Date; expiresAt: Date; }
const schema = new Schema<AuthSessionRecord>({
  accountId: { type: Schema.Types.ObjectId, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  lastActivityAt: { type: Date, required: true }, expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });
export const AuthSessionModel = models.ProxiSpeakAuthSession || model<AuthSessionRecord>('ProxiSpeakAuthSession', schema);
