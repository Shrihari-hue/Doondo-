/**
 * Transactional SMS — send a plain text message to a phone number.
 *
 * This is distinct from the OTP delivery in `modules/verification/sms.ts`,
 * which uses provider *verification* endpoints (Twilio Verify / MSG91 OTP)
 * that can only send a code, not arbitrary copy. New-applicant alerts and
 * other notices need free-text SMS, which is a different provider API.
 *
 * Provider strategy mirrors the OTP module: a thin interface with a
 * console implementation that logs in dev, and real providers slotting in
 * behind `SMS_PROVIDER`. The MSG91 *flow* / Twilio *Messages* integrations
 * are intentionally left as a single clearly-marked hook so wiring a real
 * number later is a localized change — until then we log, exactly like the
 * console OTP path, so the rest of the app (opt-in, the apply trigger) is
 * fully exercised in dev.
 *
 * Never throws to the caller — SMS is best-effort. Failures are logged and
 * swallowed so a flaky provider never breaks the action that triggered the
 * message (e.g. submitting an application).
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface TransactionalSmsInput {
  /** Destination phone, in whatever format it's stored (we pass through). */
  phone: string;
  /** The message body. Keep well under 160 chars to stay single-segment. */
  message: string;
}

/** Console provider — logs the message. The dev/CI default. */
async function consoleSend({ phone, message }: TransactionalSmsInput): Promise<void> {
  logger.info({ phone, message, provider: 'console' }, 'transactional SMS (console)');
}

/** Twilio Programmable Messaging. Auth: API key pair, else account SID + auth token. */
async function twilioSend({ phone, message }: TransactionalSmsInput): Promise<boolean> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const user = env.TWILIO_API_KEY_SID ?? sid;
  const pass = env.TWILIO_API_KEY_SECRET ?? env.TWILIO_AUTH_TOKEN;
  const sender: Record<string, string> | null = env.TWILIO_MESSAGING_SERVICE_SID
    ? { MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
    : env.TWILIO_SMS_FROM
      ? { From: env.TWILIO_SMS_FROM }
      : null;
  if (!sid || !user || !pass || !sender) return false;
  const to = phone.startsWith('+') ? phone : `${env.PHONE_DEFAULT_COUNTRY}${phone.replace(/^0+/, '')}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, Body: message, ...sender }).toString(),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }, 'twilio sms rejected');
    return false;
  }
  return true;
}

/**
 * Send a transactional SMS. Resolves true if a provider accepted it,
 * false otherwise. Best-effort: catches everything.
 */
export async function sendTransactionalSms(input: TransactionalSmsInput): Promise<boolean> {
  try {
    if (!input.phone || !input.message) return false;
    // Real providers slot in here, keyed off env.SMS_PROVIDER. Until a
    // transactional number/flow is configured we log via the console
    // provider — the same honest dev behaviour the OTP module uses.
    if (env.SMS_PROVIDER === 'twilio') {
      if (await twilioSend(input)) return true;
      logger.warn('transactional SMS: Twilio not configured for messaging (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM) — console fallback');
    }
    await consoleSend(input);
    return env.SMS_PROVIDER === 'console';
  } catch (err) {
    logger.warn({ err }, 'transactional SMS send failed');
    return false;
  }
}
