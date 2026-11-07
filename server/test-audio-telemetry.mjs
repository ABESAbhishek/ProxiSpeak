import assert from 'node:assert';

/**
 * ProxiSpeak — ITU-T G.107 E-Model MOS Voice Quality Verification
 *
 * Verifies calculation of voice Mean Opinion Score (1.0 - 4.5),
 * packet loss percentages, effective delay, and network quality rating categorisation.
 */

console.log('--- Starting ProxiSpeak WebRTC Audio Telemetry & MOS Verification ---');

function calculateAudioMOS(rttMs, jitterMs, packetLossPercent = 0) {
  const safeRtt = Math.max(0, rttMs);
  const safeJitter = Math.max(0, jitterMs);
  const safeLoss = Math.max(0, Math.min(100, packetLossPercent));

  // Effective one-way latency estimation including playback jitter buffer
  const effectiveDelayMs = Math.round((safeRtt / 2) + (safeJitter * 2) + 10);

  // Latency impairment (Id) for delays exceeding 160ms
  let delayImpairment = 0;
  if (effectiveDelayMs > 160) {
    delayImpairment = (effectiveDelayMs - 160) / 40;
  }

  // Equipment / loss impairment (Ie) for Opus speech codec
  const lossImpairment = Math.min(45, safeLoss * 2.5);

  // Transmission rating factor R (0 to 100)
  const rFactor = Math.max(0, Math.min(100, 94.2 - delayImpairment - lossImpairment));

  // ITU-T G.107 R-factor to MOS polynomial transformation
  let rawMos = 1.0;
  if (rFactor > 0) {
    rawMos = 1 + 0.035 * rFactor + rFactor * (rFactor - 60) * (100 - rFactor) * 0.000007;
  }

  const mos = Math.max(1.0, Math.min(4.5, Math.round(rawMos * 10) / 10));

  let rating = 'poor';
  if (mos >= 4.1) {
    rating = 'excellent';
  } else if (mos >= 3.6) {
    rating = 'good';
  } else if (mos >= 3.0) {
    rating = 'fair';
  }

  return {
    mos,
    rating,
    effectiveDelayMs,
    packetLossPercent: Math.round(safeLoss * 10) / 10
  };
}

// 1. Pristine / Fiber Network Profile
const ideal = calculateAudioMOS(12, 3, 0);
assert.strictEqual(ideal.rating, 'excellent', 'Ideal low-latency stream must achieve excellent rating');
assert.ok(ideal.mos >= 4.2 && ideal.mos <= 4.5, `Ideal MOS should be >= 4.2 (got ${ideal.mos})`);
console.log(`[PASS] Fiber/LAN (RTT: 12ms, Jitter: 3ms, Loss: 0%) -> MOS: ${ideal.mos} (${ideal.rating}), Delay: ${ideal.effectiveDelayMs}ms`);

// 2. High-Quality Broadband Profile
const broadband = calculateAudioMOS(45, 8, 0.2);
assert.ok(broadband.rating === 'excellent' || broadband.rating === 'good', 'Broadband stream must be good/excellent');
assert.ok(broadband.mos >= 4.0, `Broadband MOS should be >= 4.0 (got ${broadband.mos})`);
console.log(`[PASS] Broadband (RTT: 45ms, Jitter: 8ms, Loss: 0.2%) -> MOS: ${broadband.mos} (${broadband.rating}), Delay: ${broadband.effectiveDelayMs}ms`);

// 3. Jittery Wi-Fi Profile (moderate packet loss & delay)
const wifi = calculateAudioMOS(220, 50, 5.0);
assert.strictEqual(wifi.rating, 'good', 'Moderate Wi-Fi jitter & loss should yield good rating');
assert.ok(wifi.mos >= 3.6 && wifi.mos <= 4.1, `Wi-Fi MOS should be 3.6-4.1 (got ${wifi.mos})`);
console.log(`[PASS] Wi-Fi Jitter (RTT: 220ms, Jitter: 50ms, Loss: 5.0%) -> MOS: ${wifi.mos} (${wifi.rating}), Delay: ${wifi.effectiveDelayMs}ms`);

// 4. Mobile / Congested Cellular Profile (higher packet loss & delay)
const congested = calculateAudioMOS(280, 60, 10.0);
assert.strictEqual(congested.rating, 'fair', 'Congested network should be rated fair');
assert.ok(congested.mos >= 3.0 && congested.mos <= 3.5, `Congested MOS should be 3.0-3.5 (got ${congested.mos})`);
console.log(`[PASS] Congested Cellular (RTT: 280ms, Jitter: 60ms, Loss: 10.0%) -> MOS: ${congested.mos} (${congested.rating}), Delay: ${congested.effectiveDelayMs}ms`);

// 5. Severe Loss / Satellite Link Profile
const satellite = calculateAudioMOS(620, 110, 20.0);
assert.strictEqual(satellite.rating, 'poor', 'Extreme loss/latency must yield poor quality rating');
assert.ok(satellite.mos < 3.0, `Extreme loss MOS should be < 3.0 (got ${satellite.mos})`);
console.log(`[PASS] Severe Loss/Satellite (RTT: 620ms, Jitter: 110ms, Loss: 20%) -> MOS: ${satellite.mos} (${satellite.rating}), Delay: ${satellite.effectiveDelayMs}ms`);

// 6. Clamp & Edge cases
const negativeInput = calculateAudioMOS(-50, -10, -5);
assert.strictEqual(negativeInput.effectiveDelayMs, 10, 'Negative delay input must clamp to 0 with +10ms jitter baseline');
assert.strictEqual(negativeInput.packetLossPercent, 0, 'Negative packet loss must clamp to 0%');
console.log(`[PASS] Negative inputs clamped safely: Delay ${negativeInput.effectiveDelayMs}ms, Loss ${negativeInput.packetLossPercent}%`);

const excessiveLoss = calculateAudioMOS(100, 10, 150);
assert.strictEqual(excessiveLoss.packetLossPercent, 100, 'Loss exceeding 100% must clamp to 100%');
assert.strictEqual(excessiveLoss.rating, 'poor', '100% loss must result in poor rating');
console.log(`[PASS] Excessive loss clamped safely: Loss ${excessiveLoss.packetLossPercent}%, MOS: ${excessiveLoss.mos}`);

// 7. Instantaneous Delta Loss Calculation Test
function calculateDeltaLoss(prev, current) {
  const deltaLost = Math.max(0, current.packetsLost - prev.packetsLost);
  const deltaReceived = Math.max(0, current.packetsReceived - prev.packetsReceived);
  const total = deltaLost + deltaReceived;
  return total > 0 ? Math.round((deltaLost / total) * 1000) / 10 : 0;
}

const prevReport = { packetsLost: 10, packetsReceived: 1000 };
const currReport = { packetsLost: 15, packetsReceived: 1195 }; // 5 lost out of 200 total = 2.5%
const deltaLoss = calculateDeltaLoss(prevReport, currReport);
assert.strictEqual(deltaLoss, 2.5, 'Delta loss must accurately compute 2.5% over the sampling window');
console.log(`[PASS] Instantaneous packet loss percentage delta calculation: ${deltaLoss}%`);

console.log('--- All WebRTC Audio Telemetry & MOS Tests Passed Successfully ---');
