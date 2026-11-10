import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(secret: string, email: string, purpose: string, code: string) {
  return createHmac('sha256', secret).update(`${email}\0${purpose}\0${code}`).digest('hex');
}

export function otpDigestMatches(expectedHex: string, secret: string, email: string, purpose: string, code: string) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(hashOtp(secret, email, purpose, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface OtpChallengeForVerification {
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

export async function verifyAndConsumeOtp(input: {
  record: OtpChallengeForVerification;
  code: string;
  secret: string;
  email: string;
  purpose: string;
  now?: number;
  consume: () => Promise<boolean>;
}) {
  const now = input.now ?? Date.now();
  if (now >= input.record.expiresAt.getTime() || input.record.attempts > OTP_MAX_ATTEMPTS) return false;
  if (!otpDigestMatches(input.record.codeHash, input.secret, input.email, input.purpose, input.code)) return false;
  return input.consume();
}

export class WindowRateLimiter {
  private readonly windows = new Map<string, { count: number; startedAt: number }>();

  allow(key: string, limit: number, windowMs: number, now = Date.now()) {
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      this.windows.set(key, { count: 1, startedAt: now });
      if (this.windows.size > 10_000) {
        for (const [entryKey, entry] of this.windows) if (now - entry.startedAt >= windowMs) this.windows.delete(entryKey);
      }
      return true;
    }
    if (current.count >= limit) return false;
    current.count++;
    return true;
  }
}
