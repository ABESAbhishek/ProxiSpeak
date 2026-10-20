import assert from 'node:assert';

/**
 * Spatial Audio Engine Mathematical Verification
 * Tests 3D distance, attenuation curves (linear, inverse, exponential),
 * and stereo panning azimuth calculations.
 */

console.log('--- Starting ProxiSpeak Spatial Audio Engine Mathematical Verification ---');

// 1. 3D Euclidean Distance
function calculate3DDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const dist1 = calculate3DDistance({ x: 0, y: 0, z: 0 }, { x: 30, y: 40, z: 0 });
assert.strictEqual(dist1, 50, '3D Distance between (0,0,0) and (30,40,0) must equal 50');
console.log(`[PASS] 3D Euclidean distance verified: (0,0,0) to (30,40,0) = ${dist1}`);

const dist3D = calculate3DDistance({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 6 });
assert.strictEqual(dist3D, 7, '3D Distance with Z axis (2, 3, 6) must equal 7');
console.log(`[PASS] 3D Euclidean distance with Z axis verified: ${dist3D}`);

// 2. Attenuation Models
function calculateAttenuation(distance, config = { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'linear' }) {
  const { minDistance, maxDistance, rolloffFactor, model } = config;
  if (distance <= minDistance) return 1.0;
  if (distance >= maxDistance) return 0.0;

  switch (model) {
    case 'linear': {
      const range = maxDistance - minDistance;
      return Math.max(0, Math.min(1, 1 - (distance - minDistance) / range));
    }
    case 'inverse': {
      const delta = distance - minDistance;
      const factor = minDistance / (minDistance + rolloffFactor * delta);
      return Math.max(0, Math.min(1, factor));
    }
    case 'exponential': {
      const normalized = (distance - minDistance) / (maxDistance - minDistance);
      const factor = Math.exp(-rolloffFactor * 3 * normalized);
      return Math.max(0, Math.min(1, factor));
    }
    default:
      return 1.0;
  }
}

// Within minDistance -> 1.0
assert.strictEqual(calculateAttenuation(15), 1.0, 'Volume within minDistance must be 1.0');
console.log(`[PASS] Attenuation within minDistance (15 <= 30) = 1.0`);

// Beyond maxDistance -> 0.0
assert.strictEqual(calculateAttenuation(300), 0.0, 'Volume beyond maxDistance must be 0.0');
console.log(`[PASS] Attenuation beyond maxDistance (300 >= 260) = 0.0`);

// Linear midpoint
const midDist = 30 + (260 - 30) / 2; // 145
const linearMid = calculateAttenuation(midDist, { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'linear' });
assert.strictEqual(Math.round(linearMid * 100) / 100, 0.5, 'Linear midpoint must equal 0.5');
console.log(`[PASS] Linear attenuation midpoint = ${linearMid}`);

// Inverse law
const inverseVal = calculateAttenuation(60, { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'inverse' });
assert(inverseVal > 0 && inverseVal < 1, 'Inverse falloff must produce smooth fractional volume');
console.log(`[PASS] Inverse falloff at distance 60 = ${Math.round(inverseVal * 100) / 100}`);

// Exponential decay
const expVal = calculateAttenuation(100, { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'exponential' });
assert(expVal > 0 && expVal < 1, 'Exponential falloff must produce fractional volume');
console.log(`[PASS] Exponential decay at distance 100 = ${Math.round(expVal * 100) / 100}`);

// 3. Stereo Panning and Azimuth Angle
function calculateStereoPanAndAzimuth(listenerPos, listenerHeadingRad, sourcePos) {
  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { pan: 0, azimuthDeg: 0 };
  }
  const angleToSource = Math.atan2(dx, -dy);
  let relativeAngle = angleToSource - listenerHeadingRad;
  while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
  while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
  const azimuthDeg = Math.round((relativeAngle * 180) / Math.PI);
  const pan = Math.max(-1, Math.min(1, Math.sin(relativeAngle)));
  return { pan, azimuthDeg };
}

const listener = { x: 100, y: 100 };

// Source straight North (in front)
const front = calculateStereoPanAndAzimuth(listener, 0, { x: 100, y: 50 });
assert.strictEqual(front.azimuthDeg, 0);
assert.strictEqual(Math.round(front.pan * 100) / 100, 0);
console.log(`[PASS] Direction in front: Azimuth = ${front.azimuthDeg}deg, Pan = ${front.pan} (Center)`);

// Source straight East (to the right)
const right = calculateStereoPanAndAzimuth(listener, 0, { x: 150, y: 100 });
assert.strictEqual(right.azimuthDeg, 90);
assert.strictEqual(Math.round(right.pan * 100) / 100, 1);
console.log(`[PASS] Direction to the right: Azimuth = ${right.azimuthDeg}deg, Pan = ${right.pan} (Full Right)`);

// Source straight West (to the left)
const left = calculateStereoPanAndAzimuth(listener, 0, { x: 50, y: 100 });
assert.strictEqual(left.azimuthDeg, -90);
assert.strictEqual(Math.round(left.pan * 100) / 100, -1);
console.log(`[PASS] Direction to the left: Azimuth = ${left.azimuthDeg}deg, Pan = ${left.pan} (Full Left)`);

// 4. Acoustic Distance Low-Pass Frequency Cutoff
function calculateAcousticCutoffFrequency(distance, maxDistance = 260) {
  if (distance <= 30) return 20000;
  if (distance >= maxDistance) return 2000;
  const normalized = (distance - 30) / (maxDistance - 30);
  return Math.round(20000 - normalized * (20000 - 2500));
}

assert.strictEqual(calculateAcousticCutoffFrequency(20), 20000, 'Close sound must have full 20kHz bandwidth');
console.log('[PASS] Acoustic cutoff at close distance (20 <= 30) = 20000Hz (full clarity)');

const farCutoff = calculateAcousticCutoffFrequency(260);
assert.strictEqual(farCutoff, 2000, 'Distant sound beyond maxDistance must be muffled to 2000Hz');
console.log(`[PASS] Acoustic cutoff at maxDistance (260) = ${farCutoff}Hz (natural acoustic absorption)`);

// 5. Partition Occlusion & Wall Damping
function calculateOcclusionDamping(isDifferentRoom, wallCount = 1) {
  if (!isDifferentRoom) return { volumeMultiplier: 1.0, lowpassCutoffHz: 20000 };
  const safeWalls = Math.max(1, wallCount);
  const volumeMultiplier = Math.max(0.08, Math.round(Math.pow(0.42, safeWalls) * 100) / 100);
  const lowpassCutoffHz = Math.max(600, Math.round(2400 / safeWalls));
  return { volumeMultiplier, lowpassCutoffHz };
}

const sameRoom = calculateOcclusionDamping(false);
assert.strictEqual(sameRoom.volumeMultiplier, 1.0);
assert.strictEqual(sameRoom.lowpassCutoffHz, 20000);
console.log('[PASS] Same room occlusion damping = 1.0x volume, 20000Hz cutoff');

const wallDamped = calculateOcclusionDamping(true, 1);
assert.strictEqual(wallDamped.volumeMultiplier, 0.42);
assert.strictEqual(wallDamped.lowpassCutoffHz, 2400);
console.log(`[PASS] 1-wall partition occlusion = ${wallDamped.volumeMultiplier}x volume, ${wallDamped.lowpassCutoffHz}Hz lowpass`);

// 6. Architectural Acoustic Zone Presets
const SPATIAL_PRESETS = {
  whisper: { minDistance: 15, maxDistance: 90, rolloffFactor: 1.5, model: 'exponential' },
  normal: { minDistance: 30, maxDistance: 260, rolloffFactor: 1.0, model: 'linear' },
  meeting: { minDistance: 50, maxDistance: 350, rolloffFactor: 0.8, model: 'inverse' },
  auditorium: { minDistance: 100, maxDistance: 800, rolloffFactor: 0.5, model: 'linear' }
};

const whisperFar = calculateAttenuation(100, SPATIAL_PRESETS.whisper);
assert.strictEqual(whisperFar, 0.0, 'Whisper voice must be inaudible beyond 90 units');
console.log('[PASS] Whisper acoustic preset: inaudible at distance 100 (> 90 maxDistance)');

const auditoriumMid = calculateAttenuation(450, SPATIAL_PRESETS.auditorium);
assert(auditoriumMid > 0.45 && auditoriumMid < 0.55, 'Auditorium preset must preserve voice carrying power at distance 450');
console.log(`[PASS] Auditorium acoustic preset: carry factor at 450 units = ${Math.round(auditoriumMid * 100)}%`);

// 7. Full Unified Occluded Spatial Audio Pipeline
function computeSpatialAudio(listenerPos, listenerHeadingRad, sourcePos, config = SPATIAL_PRESETS.normal) {
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

function evaluateOccludedSpatialAudio(listenerPos, listenerHeadingRad, sourcePos, options = {}) {
  const config = options.config || (options.preset ? SPATIAL_PRESETS[options.preset] : SPATIAL_PRESETS.normal);
  const base = computeSpatialAudio(listenerPos, listenerHeadingRad, sourcePos, config);

  if (!options.isDifferentRoom) return base;

  const { volumeMultiplier, lowpassCutoffHz: wallCutoffHz } = calculateOcclusionDamping(
    true,
    options.wallCount ?? 1
  );

  return {
    ...base,
    volume: Math.max(0, Math.min(1, Math.round(base.volume * volumeMultiplier * 100) / 100)),
    cutoffFrequencyHz: Math.max(400, Math.min(base.cutoffFrequencyHz, wallCutoffHz))
  };
}

const openOfficePeer = evaluateOccludedSpatialAudio(
  { x: 100, y: 100, z: 0 },
  0,
  { x: 100, y: 140, z: 0 },
  { preset: 'normal', isDifferentRoom: false }
);
assert.strictEqual(openOfficePeer.cutoffFrequencyHz, 19239);
assert(openOfficePeer.volume > 0.9, 'Close open office peer has near-full volume');
console.log(`[PASS] Unified spatial evaluation (Open Office): Volume = ${openOfficePeer.volume}, Cutoff = ${openOfficePeer.cutoffFrequencyHz}Hz`);

const occludedPeer = evaluateOccludedSpatialAudio(
  { x: 100, y: 100, z: 0 },
  0,
  { x: 100, y: 140, z: 0 },
  { preset: 'normal', isDifferentRoom: true, wallCount: 1 }
);
assert.strictEqual(occludedPeer.cutoffFrequencyHz, 2400, 'Occluded peer must be clamped to 2400Hz lowpass wall cutoff');
assert.strictEqual(Math.round(occludedPeer.volume * 100) / 100, Math.round(openOfficePeer.volume * 0.42 * 100) / 100);
console.log(`[PASS] Unified spatial evaluation (Behind Wall): Volume = ${occludedPeer.volume} (damped by 0.42x), Cutoff = ${occludedPeer.cutoffFrequencyHz}Hz (lowpass clamped)`);

console.log('\n======================================================');
console.log('  ALL SPATIAL AUDIO MATHEMATICAL TESTS PASSED!        ');
console.log('======================================================\n');
process.exit(0);

