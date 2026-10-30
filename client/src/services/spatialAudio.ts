/**
 * ProxiSpeak — Spatial Audio Engine (Prepared for Week 2 Integration)
 *
 * Provides 3D distance attenuation, spatial stereo panning, and
 * Web Audio API GainNode / StereoPannerNode management for peer audio streams.
 */

import type { Position3D } from '../types';

export type AttenuationModel = 'linear' | 'inverse' | 'exponential';

// Safe audio gain and transition limits
export const MIN_AUDIO_GAIN = 0;
export const MAX_AUDIO_GAIN = 1;

export const DEFAULT_GAIN_SMOOTHING = 0.08;

const MIN_SMOOTHING = 0.01;
const MAX_SMOOTHING = 1.0;

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return MIN_AUDIO_GAIN;
  return Math.max(MIN_AUDIO_GAIN, Math.min(MAX_AUDIO_GAIN, value));
}

function clampPan(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function getSafeSmoothing(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GAIN_SMOOTHING;
  return Math.max(MIN_SMOOTHING, Math.min(MAX_SMOOTHING, value));
}

export interface SpatialAudioConfig {
  minDistance: number;       // Distance within which volume is 100% (default: 30)
  maxDistance: number;       // Distance beyond which sound cuts off (default: 260)
  rolloffFactor: number;     // Rolloff steepness for inverse/exponential models (default: 1.0)
  model: AttenuationModel;   // Falloff mathematical model
}

export const DEFAULT_SPATIAL_CONFIG: SpatialAudioConfig = {
  minDistance: 30,
  maxDistance: 260,
  rolloffFactor: 1.0,
  model: 'linear'
};

/**
 * Architectural Acoustic Presets for Week 2 Virtual Office Zones
 */
export const SPATIAL_PRESETS: Record<'whisper' | 'normal' | 'meeting' | 'auditorium', SpatialAudioConfig> = {
  whisper: { minDistance: 15, maxDistance: 90, rolloffFactor: 1.5, model: 'exponential' },
  normal: { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'linear' },
  meeting: { minDistance: 50, maxDistance: 350, rolloffFactor: 0.8, model: 'inverse' },
  auditorium: { minDistance: 100, maxDistance: 800, rolloffFactor: 0.5, model: 'linear' }
};

export interface OfficeAcousticZone {
  id: string;
  name: string;
  preset: keyof typeof SPATIAL_PRESETS;
  icon: string;
  description: string;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  center?: { x: number; y: number; radius: number };
}

/**
 * Architectural Acoustic Zones mapped to 3D virtual office spatial layout
 */
export const OFFICE_ACOUSTIC_ZONES: OfficeAcousticZone[] = [
  {
    id: 'meeting-table',
    name: 'Conference Room',
    preset: 'meeting',
    icon: '👥',
    description: 'Inverse falloff with extended clarity for group deliberations.',
    center: { x: 500, y: 200, radius: 95 }
  },
  {
    id: 'focus-pod',
    name: 'Quiet Focus Pod',
    preset: 'whisper',
    icon: '🎙️',
    description: 'Exponential dropoff preserving confidentiality in deep focus.',
    center: { x: 844, y: 466, radius: 90 }
  },
  {
    id: 'recording-studio',
    name: 'Creative Studio',
    preset: 'whisper',
    icon: '🎧',
    description: 'Acoustically treated studio zone with rapid sound damping.',
    center: { x: 156, y: 466, radius: 90 }
  },
  {
    id: 'all-hands',
    name: 'All-Hands Auditorium',
    preset: 'auditorium',
    icon: '📢',
    description: 'Long-range linear projection carrying speech across the hall.',
    bounds: { minX: 360, maxX: 640, minY: 320, maxY: 480 }
  },
  {
    id: 'open-workspace',
    name: 'Open Workspace',
    preset: 'normal',
    icon: '🏢',
    description: 'Natural distance falloff balanced for daily team collaboration.'
  }
];

/**
 * Detects the acoustic zone based on 3D spatial coordinates
 */
export function detectAcousticZone(position: Position3D): OfficeAcousticZone {
  const x = position.x;
  const y = position.y;

  for (const zone of OFFICE_ACOUSTIC_ZONES) {
    if (zone.center) {
      const dx = x - zone.center.x;
      const dy = y - zone.center.y;
      if (Math.hypot(dx, dy) <= zone.center.radius) {
        return zone;
      }
    } else if (zone.bounds) {
      if (
        x >= zone.bounds.minX &&
        x <= zone.bounds.maxX &&
        y >= zone.bounds.minY &&
        y <= zone.bounds.maxY
      ) {
        return zone;
      }
    }
  }

  return OFFICE_ACOUSTIC_ZONES[OFFICE_ACOUSTIC_ZONES.length - 1];
}

/**
 * Checks whether two zones require partition wall acoustic occlusion
 */
export function areZonesOccluded(zoneA: OfficeAcousticZone, zoneB: OfficeAcousticZone): boolean {
  if (zoneA.id === zoneB.id) return false;
  const privateZones = new Set(['meeting-table', 'focus-pod', 'recording-studio']);
  return privateZones.has(zoneA.id) || privateZones.has(zoneB.id);
}

export interface SpatialAudioResult {
  distance: number;
  volume: number;            // Normalized volume 0.0 to 1.0
  pan: number;               // Stereo pan -1.0 (left) to 1.0 (right)
  azimuthDeg: number;        // Angle relative to listener facing direction (-180 to 180)
  cutoffFrequencyHz: number; // Acoustic low-pass frequency cutoff (Hz)
}

/**
 * Calculates physical atmospheric high-frequency air absorption cutoff.
 * As distance increases, human voice loses high frequencies, sounding naturally distant.
 */
export function calculateAcousticCutoffFrequency(
  distance: number,
  maxDistance: number = 260
): number {
  if (distance <= 30) return 20000;
  if (distance >= maxDistance) return 2000;
  const normalized = (distance - 30) / (maxDistance - 30);
  return Math.round(20000 - normalized * (20000 - 2500));
}

/**
 * Calculates wall absorption & partition occlusion damping for Week 2 office rooms.
 */
export function calculateOcclusionDamping(
  isDifferentRoom: boolean,
  wallCount: number = 1
): { volumeMultiplier: number; lowpassCutoffHz: number } {
  if (!isDifferentRoom) return { volumeMultiplier: 1.0, lowpassCutoffHz: 20000 };
  const safeWalls = Math.max(1, wallCount);
  const volumeMultiplier = Math.max(0.08, Math.round(Math.pow(0.42, safeWalls) * 100) / 100);
  const lowpassCutoffHz = Math.max(600, Math.round(2400 / safeWalls));
  return { volumeMultiplier, lowpassCutoffHz };
}

/**
 * Calculates Euclidean distance in 3D space between two points.
 */
export function calculate3DDistance(p1: Position3D, p2: Position3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Computes volume attenuation based on selected falloff curve.
 */
export function calculateAttenuation(
  distance: number,
  config: SpatialAudioConfig = DEFAULT_SPATIAL_CONFIG
): number {
  const { minDistance, maxDistance, rolloffFactor, model } = config;

  if (distance <= minDistance) return 1.0;
  if (distance >= maxDistance) return 0.0;

  switch (model) {
    case 'linear': {
      const range = maxDistance - minDistance;
      return Math.max(0, Math.min(1, 1 - (distance - minDistance) / range));
    }

    case 'inverse': {
      // Acoustic physical inverse-distance falloff: V = d_min / (d_min + rolloff * (d - d_min))
      const delta = distance - minDistance;
      const factor = minDistance / (minDistance + rolloffFactor * delta);
      return Math.max(0, Math.min(1, factor));
    }

    case 'exponential': {
      // Exponential decay: V = exp(-rolloff * normalized_distance)
      const normalized = (distance - minDistance) / (maxDistance - minDistance);
      const factor = Math.exp(-rolloffFactor * 3 * normalized);
      return Math.max(0, Math.min(1, factor));
    }

    default:
      return 1.0;
  }
}

/**
 * Calculates stereo panning (-1.0 to 1.0) and azimuth angle based on listener position and orientation.
 *
 * @param listenerPos Listener's position
 * @param listenerHeadingRad Listener facing angle in radians (0 = Facing North/Up)
 * @param sourcePos Sound source position
 */
export function calculateStereoPanAndAzimuth(
  listenerPos: Position3D,
  listenerHeadingRad: number,
  sourcePos: Position3D
): { pan: number; azimuthDeg: number } {
  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { pan: 0, azimuthDeg: 0 };
  }

  // World angle to sound source (radians)
  const angleToSource = Math.atan2(dx, -dy); // 0 = straight up (North), PI/2 = right (East)

  // Relative angle compared to listener heading
  let relativeAngle = angleToSource - listenerHeadingRad;
  while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
  while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

  const azimuthDeg = Math.round((relativeAngle * 180) / Math.PI);

  // Stereo pan: sine of relative angle produces smooth left/right panning
  // (-1.0 = 90 deg to left, +1.0 = 90 deg to right, 0.0 = directly in front or behind)
  const pan = Math.max(-1, Math.min(1, Math.sin(relativeAngle)));

  return { pan, azimuthDeg };
}

/**
 * Unified spatial evaluation function ready for Week 2 3D Avatar/Physics integration.
 */
export function computeSpatialAudio(
  listenerPos: Position3D,
  listenerHeadingRad: number,
  sourcePos: Position3D,
  config: SpatialAudioConfig = DEFAULT_SPATIAL_CONFIG
): SpatialAudioResult {
  const distance = calculate3DDistance(listenerPos, sourcePos);
  const volume = calculateAttenuation(distance, config);
  const { pan, azimuthDeg } = calculateStereoPanAndAzimuth(listenerPos, listenerHeadingRad, sourcePos);
  const cutoffFrequencyHz = calculateAcousticCutoffFrequency(distance, config.maxDistance);

  return {
    distance: Math.round(distance * 10) / 10,
    volume: Math.round(volume * 100) / 100,
    pan: Math.round(pan * 100) / 100,
    azimuthDeg,
    cutoffFrequencyHz
  };
}

export interface OcclusionOptions {
  config?: SpatialAudioConfig;
  preset?: keyof typeof SPATIAL_PRESETS;
  isDifferentRoom?: boolean;
  wallCount?: number;
}

/**
 * Advanced spatial evaluation function combining 3D distance, acoustic zone preset,
 * directional stereo panning, atmospheric lowpass absorption, and partition wall occlusion damping.
 */
export function evaluateOccludedSpatialAudio(
  listenerPos: Position3D,
  listenerHeadingRad: number,
  sourcePos: Position3D,
  options: OcclusionOptions = {}
): SpatialAudioResult {
  const config = options.config || (options.preset ? SPATIAL_PRESETS[options.preset] : DEFAULT_SPATIAL_CONFIG);
  const base = computeSpatialAudio(listenerPos, listenerHeadingRad, sourcePos, config);

  if (!options.isDifferentRoom) {
    return base;
  }

  const { volumeMultiplier, lowpassCutoffHz: wallCutoffHz } = calculateOcclusionDamping(
    true,
    options.wallCount ?? 1
  );

  const dampedVolume = Math.max(0, Math.min(1, Math.round(base.volume * volumeMultiplier * 100) / 100));
  const dampedCutoff = Math.max(400, Math.min(base.cutoffFrequencyHz, wallCutoffHz));

  return {
    ...base,
    volume: dampedVolume,
    cutoffFrequencyHz: dampedCutoff
  };
}

/**
 * Web Audio API Spatial Audio Controller
 * Manages BiquadFilterNode (acoustic distance/occlusion), GainNode (volume)
 * and StereoPannerNode per remote peer stream to provide smooth spatial attenuation.
 */
export class SpatialAudioGraph {
  private audioCtx: AudioContext | null = null;
  private peerNodes: Map<string, {
    source: MediaStreamAudioSourceNode;
    gain: GainNode;
    panner: StereoPannerNode | null;
    filter: BiquadFilterNode | null;
  }> = new Map();

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => { });
    }
    return this.audioCtx;
  }

  /**
   * Connects a remote MediaStream to Web Audio API processing chain:
   * MediaStreamSource -> BiquadFilterNode -> GainNode -> StereoPannerNode -> Destination
   */
  public attachStream(peerId: string, stream: MediaStream): void {
    try {
      const ctx = this.getAudioContext();
      this.detachStream(peerId);

      const source = ctx.createMediaStreamSource(stream);

      let filter: BiquadFilterNode | null = null;
      if (typeof ctx.createBiquadFilter === 'function') {
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(20000, ctx.currentTime);
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(
        MAX_AUDIO_GAIN,
        ctx.currentTime
      );

      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(0, ctx.currentTime);

        if (filter) {
          source.connect(filter);
          filter.connect(gain);
        } else {
          source.connect(gain);
        }
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        if (filter) {
          source.connect(filter);
          filter.connect(gain);
        } else {
          source.connect(gain);
        }
        gain.connect(ctx.destination);
      }

      this.peerNodes.set(peerId, { source, gain, panner, filter });
      console.log(`[SpatialAudio] Attached Web Audio graph for peer ${peerId}`);
    } catch (err) {
      console.warn(`[SpatialAudio] Could not attach Web Audio graph for ${peerId}:`, err);
    }
  }

  /**
   * Applies smooth spatial parameters (volume, stereo pan, and acoustic low-pass cutoff) to a peer stream.
   */
  public updateSpatialParameters(
    peerId: string,
    volume: number,
    pan: number = 0,
    smoothing: number = DEFAULT_GAIN_SMOOTHING,
    cutoffHz?: number
  ): void {
    const nodes = this.peerNodes.get(peerId);
    if (!nodes || !this.audioCtx) return;

    const currentTime = this.audioCtx.currentTime;
    const clampedVolume = clampGain(volume);
    const clampedPan = clampPan(pan);
    const safeSmoothing = getSafeSmoothing(smoothing);

    const gainParam = nodes.gain.gain;

    if (typeof gainParam.cancelAndHoldAtTime === 'function') {
      gainParam.cancelAndHoldAtTime(currentTime);
    } else {
      gainParam.cancelScheduledValues(currentTime);
    }

    gainParam.setTargetAtTime(
      clampedVolume,
      currentTime,
      safeSmoothing
    );

    if (nodes.panner) {
      const panParam = nodes.panner.pan;

      if (typeof panParam.cancelAndHoldAtTime === 'function') {
        panParam.cancelAndHoldAtTime(currentTime);
      } else {
        panParam.cancelScheduledValues(currentTime);
      }

      panParam.setTargetAtTime(
        clampedPan,
        currentTime,
        safeSmoothing
      );
    }

    if (nodes.filter && typeof cutoffHz === 'number') {
      const clampedFreq = Math.max(400, Math.min(20000, cutoffHz));
      nodes.filter.frequency.setTargetAtTime(clampedFreq, currentTime, 0.05);
    }
  }



  /**
   * Disconnects and cleans up audio nodes for a peer.
   */
  public detachStream(peerId: string): void {
    const nodes = this.peerNodes.get(peerId);
    if (nodes) {
      try {
        nodes.source.disconnect();
        nodes.filter?.disconnect();
        nodes.gain.disconnect();
        nodes.panner?.disconnect();
      } catch {
        // ignore disconnection errors on teardown
      }
      this.peerNodes.delete(peerId);
    }
  }

  public destroy(): void {
    this.peerNodes.forEach((_, id) => this.detachStream(id));
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => { });
      this.audioCtx = null;
    }
  }
}
