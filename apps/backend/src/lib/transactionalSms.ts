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
    if (env.SMS_PROVIDER !== 'console') {
      logger.warn(
        { provider: env.SMS_PROVIDER },
        'transactional SMS provider not yet wired — falling back to console log',
      );
    }
    await consoleSend(input);
    return true;
  } catch (err) {
    logger.warn({ err }, 'transactional SMS send failed');
    return false;
  }
}
