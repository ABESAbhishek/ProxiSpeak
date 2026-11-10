import { Schema, model, models } from 'mongoose';
const schema = new Schema({ email: { type: String, required: true }, purpose: { type: String, required: true }, codeHash: { type: String, required: true }, expiresAt: { type: Date, required: true, index: { expires: 0 } }, attempts: { type: Number, default: 0 }, sentAt: { type: Date, required: true } }, { timestamps: true });
schema.index({ email: 1, purpose: 1 }, { unique: true });
export const EmailCodeModel = models.ProxiSpeakEmailCode || model('ProxiSpeakEmailCode', schema);
