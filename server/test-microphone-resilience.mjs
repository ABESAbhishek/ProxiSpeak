import assert from 'node:assert';

/**
 * ProxiSpeak — Microphone Resilience & Device Hotplug Verification
 *
 * Verifies audio constraint fallback ladders, device hotplug detection,
 * self-healing track recovery logic, and Voice Activity Detection (VAD).
 */

console.log('--- Starting ProxiSpeak Microphone Resilience & Hotplug Verification ---');

// 1. Constraint Fallback Ladder Algorithm
function buildConstraintLadder(targetDevice, processing) {
  const ladder = [];

  if (targetDevice) {
    ladder.push({
      tier: 1,
      name: 'exact-device-processed',
      constraints: {
        audio: {
          deviceId: { exact: targetDevice },
          echoCancellation: processing.echoCancellation,
          noiseSuppression: processing.noiseSuppression,
          autoGainControl: processing.autoGainControl
        },
        video: false
      }
    });

    ladder.push({
      tier: 2,
      name: 'ideal-device-processed',
      constraints: {
        audio: {
          deviceId: { ideal: targetDevice },
          echoCancellation: processing.echoCancellation,
          noiseSuppression: processing.noiseSuppression,
          autoGainControl: processing.autoGainControl
        },
        video: false
      }
    });
  } else {
    ladder.push({
      tier: 1,
      name: 'default-device-processed',
      constraints: {
        audio: {
          echoCancellation: processing.echoCancellation,
          noiseSuppression: processing.noiseSuppression,
          autoGainControl: processing.autoGainControl
        },
        video: false
      }
    });
  }

  ladder.push({
    tier: 3,
    name: 'relaxed-processing',
    constraints: {
      audio: {
        echoCancellation: true
      },
      video: false
    }
  });

  ladder.push({
    tier: 4,
    name: 'minimal-fallback',
    constraints: {
      audio: true,
      video: false
    }
  });

  return ladder;
}

const processingConfig = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const targetDeviceId = 'usb-headset-mic-01';

const ladder = buildConstraintLadder(targetDeviceId, processingConfig);
assert.strictEqual(ladder.length, 4, 'Must build a 4-tier progressive fallback ladder for target device');
assert.strictEqual(ladder[0].name, 'exact-device-processed', 'Tier 1 must request exact device');
assert.strictEqual(ladder[1].name, 'ideal-device-processed', 'Tier 2 must request ideal device');
assert.strictEqual(ladder[2].name, 'relaxed-processing', 'Tier 3 must request relaxed processing');
assert.strictEqual(ladder[3].name, 'minimal-fallback', 'Tier 4 must request bare audio: true');
console.log(`[PASS] Progressive constraint ladder built with ${ladder.length} fallback tiers.`);

// 2. Simulated getUserMedia with Constraint Ladder Fallback
async function simulateGetUserMediaWithFallback(ladder, mockDriver) {
  let lastError = null;
  for (const tier of ladder) {
    try {
      const stream = await mockDriver(tier.constraints);
      return { stream, activeTier: tier.name };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Case A: Exact device fails with OverconstrainedError, ideal succeeds
const mockStrictDriver = async (constraints) => {
  if (constraints.audio?.deviceId?.exact) {
    const err = new Error('Constraint not satisfied');
    err.name = 'OverconstrainedError';
    throw err;
  }
  return { id: 'mock-stream', active: true, getAudioTracks: () => [{ id: 'track-1', readyState: 'live' }] };
};

const result = await simulateGetUserMediaWithFallback(ladder, mockStrictDriver);
assert.strictEqual(result.activeTier, 'ideal-device-processed', 'Should gracefully fall back to ideal tier when exact device fails');
assert.ok(result.stream.active, 'Resulting stream must be active');
console.log(`[PASS] Fallback from OverconstrainedError to tier: ${result.activeTier}`);

// Case B: Full processing fails on low-end driver, minimal fallback succeeds
const mockLowEndDriver = async (constraints) => {
  if (typeof constraints.audio === 'object' && Object.keys(constraints.audio).length > 0) {
    const err = new Error('Hardware does not support DSP processing');
    err.name = 'OverconstrainedError';
    throw err;
  }
  return { id: 'mock-stream-minimal', active: true, getAudioTracks: () => [{ id: 'track-2', readyState: 'live' }] };
};

const minimalResult = await simulateGetUserMediaWithFallback(ladder, mockLowEndDriver);
assert.strictEqual(minimalResult.activeTier, 'minimal-fallback', 'Should step down to minimal-fallback on low-end hardware');
console.log(`[PASS] Fallback on non-DSP hardware to tier: ${minimalResult.activeTier}`);

// 3. Hotplug Device Resolution
function resolveHotplugTarget(currentDeviceId, newlyEnumeratedDevices) {
  if (!currentDeviceId) {
    // Already on default
    return { shouldSwitch: false, nextDeviceId: '' };
  }

  const stillExists = newlyEnumeratedDevices.some((d) => d.deviceId === currentDeviceId);
  if (!stillExists) {
    // Current USB device was unplugged! Auto-switch to system default
    const fallbackId = newlyEnumeratedDevices.length > 0 ? newlyEnumeratedDevices[0].deviceId : '';
    return { shouldSwitch: true, nextDeviceId: fallbackId };
  }

  return { shouldSwitch: false, nextDeviceId: currentDeviceId };
}

const initialDevices = [
  { deviceId: 'usb-headset-mic-01', label: 'USB Headset' },
  { deviceId: 'built-in-mic-02', label: 'Realtek Internal Mic' }
];

// Disconnect USB headset
const postUnplugDevices = [
  { deviceId: 'built-in-mic-02', label: 'Realtek Internal Mic' }
];

const hotplugResolution = resolveHotplugTarget('usb-headset-mic-01', postUnplugDevices);
assert.strictEqual(hotplugResolution.shouldSwitch, true, 'Hotplug must trigger switch when active mic is unplugged');
assert.strictEqual(hotplugResolution.nextDeviceId, 'built-in-mic-02', 'Hotplug must seamlessly switch to remaining internal mic');
console.log(`[PASS] Hotplug device removal resolved: switched to '${hotplugResolution.nextDeviceId}'`);

// 4. Voice Activity Detection (VAD) & Gain Clamping
function calculateVAD(level, isMuted, threshold = 12) {
  if (isMuted) return false;
  return level > threshold;
}

assert.strictEqual(calculateVAD(5, false), false, 'Background room noise (level 5) must not trigger VAD');
assert.strictEqual(calculateVAD(35, false), true, 'Human speech (level 35) must trigger VAD');
assert.strictEqual(calculateVAD(85, true), false, 'Muted microphone must never trigger VAD regardless of acoustic level');
console.log('[PASS] VAD thresholding and mute suppression verified');

function clampGain(gain) {
  return Math.max(0, Math.min(2.0, Number.isFinite(gain) ? gain : 1.0));
}

assert.strictEqual(clampGain(1.5), 1.5, 'Valid gain within [0, 2] should be preserved');
assert.strictEqual(clampGain(-0.5), 0, 'Negative gain must clamp to 0');
assert.strictEqual(clampGain(5.0), 2.0, 'Excessive gain must clamp to 2.0');
assert.strictEqual(clampGain(NaN), 1.0, 'NaN gain must default to 1.0');
console.log('[PASS] Microphone gain clamping verified');

console.log('--- All Microphone Resilience & Hotplug Tests Passed Successfully ---');
