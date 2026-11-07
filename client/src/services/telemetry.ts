/**
 * ProxiSpeak — WebRTC Audio Telemetry & MOS Quality Scoring (ITU-T G.107 E-Model)
 *
 * Computes real-time Mean Opinion Score (MOS), packet loss fraction,
 * and audio health telemetry for multi-participant WebRTC calls.
 */

export interface AudioQualityEvaluation {
  mos: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  effectiveDelayMs: number;
  packetLossPercent: number;
}

/**
 * Calculates estimated voice Mean Opinion Score (MOS 1.0 to 4.5)
 * using the adapted ITU-T G.107 E-model for Opus WebRTC streams.
 *
 * @param rttMs Round-trip time in milliseconds
 * @param jitterMs Packet jitter in milliseconds
 * @param packetLossPercent Packet loss rate (0.0 to 100.0)
 */
export function calculateAudioMOS(
  rttMs: number,
  jitterMs: number,
  packetLossPercent: number = 0
): AudioQualityEvaluation {
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

  let rating: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
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
