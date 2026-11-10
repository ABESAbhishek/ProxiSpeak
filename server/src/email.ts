import { Resend } from 'resend';

export class EmailProviderConfigurationError extends Error {
  constructor(message = 'Email delivery is not configured. Set RESEND_API_KEY, RESEND_FROM, RESEND_OTP_TEMPLATE_ID, and OTP_SECRET on the server. If using onboarding@resend.dev, also set RESEND_TEST_RECIPIENT to the Resend account owner’s permitted address.') {
    super(message);
    this.name = 'EmailProviderConfigurationError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message = 'EMAIL_DELIVERY_FAILED') {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export function emailProviderReady() {
  return emailConfigurationError() === null;
}

export function emailConfigurationError() {
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32 || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !process.env.RESEND_OTP_TEMPLATE_ID) return new EmailProviderConfigurationError();
  if (senderAddress(process.env.RESEND_FROM) === 'onboarding@resend.dev' && !process.env.RESEND_TEST_RECIPIENT?.trim()) {
    return new EmailProviderConfigurationError('Sandbox email is disabled until RESEND_TEST_RECIPIENT is set to the Resend account owner’s permitted test address.');
  }
  return null;
}

function senderAddress(from: string) {
  const match = from.match(/<([^<>]+)>/);
  return (match?.[1] ?? from).trim().toLowerCase();
}

function retryDelay(headers: Record<string, string> | null, attempt: number) {
  const retryAfter = headers?.['retry-after'];
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(200, seconds * 1_000);
  const retryAt = retryAfter ? Date.parse(retryAfter) : NaN;
  if (Number.isFinite(retryAt)) return Math.max(200, retryAt - Date.now());
  return 200 * (2 ** attempt);
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function sendOtpEmail(input: { to: string; code: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const templateId = process.env.RESEND_OTP_TEMPLATE_ID;
  const configurationError = emailConfigurationError();
  if (!apiKey || !from || !templateId || configurationError) throw configurationError ?? new EmailProviderConfigurationError();

  if (senderAddress(from) === 'onboarding@resend.dev') {
    const permittedRecipient = process.env.RESEND_TEST_RECIPIENT?.trim().toLowerCase();
    if (!permittedRecipient) throw new EmailProviderConfigurationError('Sandbox email is disabled until RESEND_TEST_RECIPIENT is set to the Resend account owner’s permitted test address.');
    if (input.to.trim().toLowerCase() !== permittedRecipient) throw new EmailProviderConfigurationError('Sandbox email can only be sent to RESEND_TEST_RECIPIENT.');
  }

  const resend = new Resend(apiKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await resend.emails.send({
        from,
        to: input.to,
        template: { id: templateId, variables: { OTP_CODE: input.code } },
      }, { idempotencyKey: input.idempotencyKey });
      if (!result.error) {
        console.info('[Email] Resend accepted OTP message', { id: result.data.id });
        return;
      }
      const status = result.error.statusCode ?? 0;
      if (attempt < 2 && (status === 429 || status >= 500)) {
        const delay = retryDelay(result.headers, attempt);
        if (delay > 10_000) throw new EmailDeliveryError();
        await wait(delay);
        continue;
      }
      throw new EmailDeliveryError();
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      if (attempt < 2 && error instanceof TypeError) {
        await wait(200 * (2 ** attempt));
        continue;
      }
      throw new EmailDeliveryError();
    }
  }
  throw new EmailDeliveryError();
}
