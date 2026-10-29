import { Schema, model, models } from 'mongoose';

export interface PersistedUser {
  socketId: string;
  accountId?: string;
  displayName: string;
  avatarUrl?: string;
  officeId: string;
  x: number;
  y: number;
  location: { type: 'Point'; coordinates: [number, number] };
  lastSeenAt: Date;
  isActive: boolean;
  activitySummary: string;
  isMuted: boolean;
  isSpeaking: boolean;
}

const userSchema = new Schema<PersistedUser>({
  socketId: { type: String, required: true, unique: true, index: true },
  accountId: { type: String, index: true },
  displayName: { type: String, required: true, maxlength: 32 },
  avatarUrl: { type: String, default: '', maxlength: 500 },
  officeId: { type: String, required: true, index: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  // This is a planar pixel-to-coordinate mapping for a 1000 × 560 office.
  // GeoJSON's coordinate order is [longitude, latitude], not [latitude, longitude].
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  isActive: { type: Boolean, required: true, default: true, index: true },
  activitySummary: { type: String, required: true, default: 'Joined the virtual office.', maxlength: 160 },
  isMuted: { type: Boolean, required: true, default: false },
  isSpeaking: { type: Boolean, required: true, default: false }
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

export const UserModel = models.ProxiSpeakUser || model<PersistedUser>('ProxiSpeakUser', userSchema);
