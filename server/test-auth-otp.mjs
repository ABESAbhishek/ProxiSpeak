import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createOtp, hashOtp, OTP_MAX_ATTEMPTS, verifyAndConsumeOtp, WindowRateLimiter } = require('./dist/otpSecurity.js');
const { sendOtpEmail } = require('./dist/email.js');

const secret = 'unit-test-only-secret-with-at-least-32-characters';
const email = 'owner@example.test';
const purpose = 'login';

function makeHarness({ code = '042731', expiresAt = Date.now() + 60_000 } = {}) {
  let consumed = false;
  let attempts = 0;
  const record = { codeHash: hashOtp(secret, email, purpose, code), expiresAt: new Date(expiresAt) };
  return {
    get attempts() { return attempts; },
    get consumed() { return consumed; },
    async verify(candidate, now = Date.now()) {
      if (consumed || attempts >= OTP_MAX_ATTEMPTS || now >= record.expiresAt.getTime()) return false;
      attempts++;
      return verifyAndConsumeOtp({
        record: { ...record, attempts }, code: candidate, secret, email, purpose, now,
        consume: async () => {
          if (consumed) return false;
          consumed = true;
          return true;
        },
      });
    },
  };
}

test('OTP generation returns a cryptographically generated six digit string', () => {
  assert.match(createOtp(), /^\d{6}$/);
});

test('expired OTPs cannot be consumed', async () => {
  const expired = makeHarness({ expiresAt: 1_000 });
  assert.equal(await expired.verify('042731', 1_000), false);
  assert.equal(expired.consumed, false);
});

test('valid OTP is single use', async () => {
  const challenge = makeHarness();
  assert.equal(await challenge.verify('042731'), true);
  assert.equal(await challenge.verify('042731'), false);
  assert.equal(challenge.consumed, true);
});

test('invalid codes count toward the attempt limit and do not consume the code', async () => {
  const challenge = makeHarness();
  for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt++) assert.equal(await challenge.verify('000000'), false);
  assert.equal(await challenge.verify('042731'), false);
  assert.equal(challenge.attempts, OTP_MAX_ATTEMPTS);
  assert.equal(challenge.consumed, false);
});

test('request rate limiter rejects excess requests until the window expires', () => {
  const limiter = new WindowRateLimiter();
  assert.equal(limiter.allow('otp-request:127.0.0.1', 2, 60_000, 10_000), true);
  assert.equal(limiter.allow('otp-request:127.0.0.1', 2, 60_000, 11_000), true);
  assert.equal(limiter.allow('otp-request:127.0.0.1', 2, 60_000, 12_000), false);
  assert.equal(limiter.allow('otp-request:127.0.0.1', 2, 60_000, 70_000), true);
});

test('Resend sandbox rejects every recipient except the configured account-owner address', async () => {
  const saved = Object.fromEntries(['OTP_SECRET', 'RESEND_API_KEY', 'RESEND_FROM', 'RESEND_OTP_TEMPLATE_ID', 'RESEND_TEST_RECIPIENT'].map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    OTP_SECRET: secret,
    RESEND_API_KEY: 're_test_only_not_a_credential',
    RESEND_FROM: 'onboarding@resend.dev',
    RESEND_OTP_TEMPLATE_ID: 'template_test_only',
    RESEND_TEST_RECIPIENT: email,
  });
  try {
    await assert.rejects(sendOtpEmail({ to: 'other@example.test', code: '042731', idempotencyKey: 'test-only' }), /only be sent to RESEND_TEST_RECIPIENT/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
