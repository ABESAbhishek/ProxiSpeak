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

export interface AudioObstacle {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  attenuation: number;
}

// Office furniture obstacles converted to Position3D coordinates.
// Coordinates are based on the existing OfficeScene3D layout.
export const DEFAULT_AUDIO_OBSTACLES: AudioObstacle[] = [
  // Desks
  { x: 155.56, y: 88.33, halfWidth: 86.11, halfHeight: 58.33, attenuation: 0.45 },
  { x: 844.44, y: 88.33, halfWidth: 86.11, halfHeight: 58.33, attenuation: 0.45 },
  { x: 155.56, y: 465.56, halfWidth: 86.11, halfHeight: 58.33, attenuation: 0.45 },
  { x: 844.44, y: 465.56, halfWidth: 86.11, halfHeight: 58.33, attenuation: 0.45 },

  // Sofas
  { x: 341.67, y: 245.56, halfWidth: 36.11, halfHeight: 83.33, attenuation: 0.6 },
  { x: 658.33, y: 245.56, halfWidth: 36.11, halfHeight: 83.33, attenuation: 0.6 },

  // Meeting table
  { x: 500, y: 199.44, halfWidth: 69.44, halfHeight: 41.67, attenuation: 0.45 },

  // Plants
  { x: 41.67, y: 43.89, halfWidth: 23.33, halfHeight: 23.33, attenuation: 0.75 },
  { x: 958.33, y: 43.89, halfWidth: 23.33, halfHeight: 23.33, attenuation: 0.75 },
  { x: 41.67, y: 516.11, halfWidth: 23.33, halfHeight: 23.33, attenuation: 0.75 },
  { x: 958.33, y: 516.11, halfWidth: 23.33, halfHeight: 23.33, attenuation: 0.75 }
];

export const DEFAULT_SPATIAL_CONFIG: SpatialAudioConfig = {
  minDistance: 30,
  maxDistance: 260,
  rolloffFactor: 1.0,
  model: 'linear'
};

export interface SpatialAudioResult {
  distance: number;
  volume: number;            // Normalized volume 0.0 to 1.0
  pan: number;               // Stereo pan -1.0 (left) to 1.0 (right)
  azimuthDeg: number;        // Angle relative to listener facing direction (-180 to 180)
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
 * Checks whether the line between two users intersects an obstacle.
 */

export function calculateObstacleAttenuation(
  listenerPos: Position3D,
  sourcePos: Position3D,
  obstacles: AudioObstacle[]
): number {
  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;

  let attenuation = 1;

  for (const obstacle of obstacles) {
    const minX = obstacle.x - obstacle.halfWidth;
    const maxX = obstacle.x + obstacle.halfWidth;
    const minY = obstacle.y - obstacle.halfHeight;
    const maxY = obstacle.y + obstacle.halfHeight;

    let tMin = 0;
    let tMax = 1;

    const clip = (p: number, q: number): boolean => {
      if (Math.abs(p) < 1e-10) return q >= 0;

      const t = q / p;

      if (p < 0) {
        if (t > tMax) return false;
        tMin = Math.max(tMin, t);
      } else {
        if (t < tMin) return false;
        tMax = Math.min(tMax, t);
      }

      return true;
    };

    const intersects =
      clip(-dx, listenerPos.x - minX) &&
      clip(dx, maxX - listenerPos.x) &&
      clip(-dy, listenerPos.y - minY) &&
      clip(dy, maxY - listenerPos.y) &&
      tMin <= tMax &&
      tMax > 0 &&
      tMin < 1;

    if (intersects) {
      attenuation *= Math.max(
        0,
        Math.min(1, obstacle.attenuation)
      );
    }
  }

  return attenuation;
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
  config: SpatialAudioConfig = DEFAULT_SPATIAL_CONFIG,
  obstacles: AudioObstacle[] = DEFAULT_AUDIO_OBSTACLES
): SpatialAudioResult {
  const distance = calculate3DDistance(listenerPos, sourcePos);
  const baseVolume = calculateAttenuation(distance, config);

  const obstacleAttenuation = calculateObstacleAttenuation(
    listenerPos,
    sourcePos,
    obstacles
  );

  const volume = baseVolume * obstacleAttenuation;
  const { pan, azimuthDeg } = calculateStereoPanAndAzimuth(listenerPos, listenerHeadingRad, sourcePos);

  return {
    distance: Math.round(distance * 10) / 10,
    volume: Math.round(volume * 100) / 100,
    pan: Math.round(pan * 100) / 100,
    azimuthDeg
  };
}

/**
 * Web Audio API Spatial Audio Controller
 * Manages GainNode and StereoPannerNode per remote peer stream
 * to avoid abrupt audio clipping and provide smooth spatial attenuation.
 */
export class SpatialAudioGraph {
  private audioCtx: AudioContext | null = null;
  private peerNodes: Map<string, {
    source: MediaStreamAudioSourceNode;
    gain: GainNode;
    panner: StereoPannerNode | null;
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
   * MediaStreamSource -> GainNode (Volume) -> StereoPannerNode (Pan) -> Destination
   */
  public attachStream(peerId: string, stream: MediaStream): void {
    try {
      const ctx = this.getAudioContext();
      this.detachStream(peerId);

      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(
        MAX_AUDIO_GAIN,
        ctx.currentTime
      );

      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(0, ctx.currentTime);
        source.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        source.connect(gain);
        gain.connect(ctx.destination);
      }

      this.peerNodes.set(peerId, { source, gain, panner });
      console.log(`[SpatialAudio] Attached Web Audio graph for peer ${peerId}`);
    } catch (err) {
      console.warn(`[SpatialAudio] Could not attach Web Audio graph for ${peerId}:`, err);
    }
  }

  /**
   * Applies smooth spatial parameters (volume and stereo pan) to a peer stream.
   */


  public updateSpatialParameters(
    peerId: string,
    volume: number,
    pan: number = 0,
    smoothing: number = DEFAULT_GAIN_SMOOTHING
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
  }



  /**
   * Disconnects and cleans up audio nodes for a peer.
   */
  public detachStream(peerId: string): void {
    const nodes = this.peerNodes.get(peerId);
    if (nodes) {
      try {
        nodes.source.disconnect();
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
