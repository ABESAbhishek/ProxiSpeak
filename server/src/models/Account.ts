import { Schema, model, models } from 'mongoose';
export interface AccountRecord { fullName: string; username: string; email: string; passwordHash?: string; avatarUrl: string; bio: string; jobTitle: string; team: string; authProviders: string[]; emailVerified: boolean; lastSeenAt: Date; }
const schema = new Schema<AccountRecord>({
  fullName: { type: String, required: true, trim: true, maxlength: 32 },
  username: { type: String, required: true, lowercase: true, trim: true, unique: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/ },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true }, passwordHash: { type: String, select: false },
  avatarUrl: { type: String, default: '', maxlength: 500 }, bio: { type: String, default: '', maxlength: 500 },
  jobTitle: { type: String, default: '', maxlength: 80 }, team: { type: String, default: '', maxlength: 80 },
  authProviders: { type: [String], default: ['password'] }, emailVerified: { type: Boolean, default: false }, lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ email: 1 }, { unique: true }); schema.index({ username: 1 }, { unique: true });
export const AccountModel = models.ProxiSpeakAccount || model<AccountRecord>('ProxiSpeakAccount', schema);
