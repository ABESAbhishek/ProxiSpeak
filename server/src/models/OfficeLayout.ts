import { Schema, model, models, Types } from 'mongoose';

export interface OfficeFurniture {
  id: string;
  type: 'desk' | 'sofa' | 'plant' | 'table';
  label?: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
}

export interface OfficeObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blocksSound: boolean;
  soundDamping: number;
}

export interface OfficeLayoutRecord {
  roomId: string;
  ownerId: Types.ObjectId;
  revision: number;
  furniture: OfficeFurniture[];
  obstacles: OfficeObstacle[];
}

const furnitureSchema = new Schema<OfficeFurniture>({
  id: { type: String, required: true, maxlength: 64 },
  type: { type: String, required: true, enum: ['desk', 'sofa', 'plant', 'table'] },
  label: { type: String, maxlength: 48 },
  x: { type: Number, required: true, min: 0, max: 1000 },
  y: { type: Number, required: true, min: 0, max: 560 },
  width: { type: Number, required: true, min: 1, max: 1000 },
  depth: { type: Number, required: true, min: 1, max: 560 },
  rotation: { type: Number, required: true, min: -Math.PI * 2, max: Math.PI * 2 }
}, { _id: false });

const obstacleSchema = new Schema<OfficeObstacle>({
  id: { type: String, required: true, maxlength: 64 },
  x: { type: Number, required: true, min: 0, max: 1000 },
  y: { type: Number, required: true, min: 0, max: 560 },
  width: { type: Number, required: true, min: 1, max: 1000 },
  height: { type: Number, required: true, min: 1, max: 560 },
  blocksSound: { type: Boolean, required: true, default: true },
  soundDamping: { type: Number, required: true, min: 0, max: 1, default: 0.45 }
}, { _id: false });

const officeLayoutSchema = new Schema<OfficeLayoutRecord>({
  roomId: { type: String, required: true, unique: true, index: true, match: /^[\w-]{1,64}$/ },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'ProxiSpeakAccount' },
  revision: { type: Number, required: true, default: 1, min: 1 },
  furniture: { type: [furnitureSchema], required: true, default: [] },
  obstacles: { type: [obstacleSchema], required: true, default: [] }
}, { timestamps: true });

export const OfficeLayoutModel = models.ProxiSpeakOfficeLayout || model<OfficeLayoutRecord>('ProxiSpeakOfficeLayout', officeLayoutSchema);
