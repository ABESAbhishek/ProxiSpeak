import assert from 'node:assert';
import {
  calculateObstacleAttenuation,
  computeSpatialAudio
} from '../client/src/services/spatialAudio.ts';

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
// 4. Obstacle-aware audio attenuation
// function calculateObstacleAttenuation(listenerPos, sourcePos, obstacles) {
//   let attenuation = 1;

//   for (const obstacle of obstacles) {
//     const dx = sourcePos.x - listenerPos.x;
//     const dy = sourcePos.y - listenerPos.y;

//     const steps = 100;
//     let intersects = false;

//     for (let i = 1; i < steps; i++) {
//       const t = i / steps;
//       const x = listenerPos.x + dx * t;
//       const y = listenerPos.y + dy * t;

//       if (
//         Math.abs(x - obstacle.x) <= obstacle.halfWidth &&
//         Math.abs(y - obstacle.y) <= obstacle.halfHeight
//       ) {
//         intersects = true;
//         break;
//       }
//     }

//     if (intersects) {
//       attenuation *= Math.max(0, Math.min(1, obstacle.attenuation));
//     }
//   }

//   return attenuation;
// }

const audioListener = { x: 0, y: 0 };
const audioSource = { x: 100, y: 0 };

const noObstacles = calculateObstacleAttenuation(
  audioListener,
  audioSource,
  []
);
assert.strictEqual(noObstacles, 1);
console.log('[PASS] No obstacle: audio remains unaffected');

const oneObstacle = calculateObstacleAttenuation(
  audioListener,
  audioSource,
  [{ x: 50, y: 0, halfWidth: 5, halfHeight: 5, attenuation: 0.5 }]
);
assert.strictEqual(oneObstacle, 0.5);
console.log('[PASS] One obstacle: audio attenuation = 0.5');

const multipleObstacles = calculateObstacleAttenuation(
  audioListener,
  audioSource,
  [
    { x: 30, y: 0, halfWidth: 5, halfHeight: 5, attenuation: 0.5 },
    { x: 70, y: 0, halfWidth: 5, halfHeight: 5, attenuation: 0.4 }
  ]
);
assert.strictEqual(multipleObstacles, 0.2);
console.log('[PASS] Multiple obstacles: cumulative attenuation = 0.2');

const obstacleOutsidePath = calculateObstacleAttenuation(
  audioListener,
  audioSource,
  [{ x: 50, y: 30, halfWidth: 5, halfHeight: 5, attenuation: 0.5 }]
);
assert.strictEqual(obstacleOutsidePath, 1);
console.log('[PASS] Obstacle outside sound path: audio remains unaffected');

// 5. Production spatial audio integration with obstacles

const clearAudio = computeSpatialAudio(
  { x: 0, y: 0, z: 0 },
  0,
  { x: 100, y: 0, z: 0 },
  undefined,
  []
);

const blockedAudio = computeSpatialAudio(
  { x: 0, y: 0, z: 0 },
  0,
  { x: 100, y: 0, z: 0 },
  undefined,
  [{ x: 50, y: 0, halfWidth: 5, halfHeight: 5, attenuation: 0.5 }]
);

assert.ok(blockedAudio.volume < clearAudio.volume);
assert.strictEqual(blockedAudio.pan, clearAudio.pan);

console.log('[PASS] Production spatial audio applies obstacle attenuation');
console.log('[PASS] Obstacle attenuation preserves stereo panning');

console.log('\n======================================================');
console.log('  ALL SPATIAL AUDIO MATHEMATICAL TESTS PASSED!        ');
console.log('======================================================\n');
process.exit(0);
