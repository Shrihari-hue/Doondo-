/**
 * OTP service — phone canonicalisation + delegation to the active OtpProvider.
 *
 * The actual "send the code", "verify the code" work happens inside the
 * provider (Twilio / MSG91 / console). This file just normalises the phone
 * input, turns provider results into our HTTP envelope shape, and gives the
 * verification.service.ts a clean two-function surface to call.
 *
 * Why we don't store anything here when Twilio is in play: Twilio Verify
 * owns the whole challenge lifecycle (generate, deliver, attempt count,
 * TTL). Storing a parallel record would just drift out of sync.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { getOtpProvider } from './sms';

/**
 * Normalize a phone number to E.164-ish form. Adds the default country code
 * (env.PHONE_DEFAULT_COUNTRY, +91 by default) when the user typed only digits.
 * Strips spaces and dashes.
 */
export function canonicalisePhone(input: string): string {
  const cleaned = input.replace(/[\s-]/g, '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  return `${env.PHONE_DEFAULT_COUNTRY}${cleaned}`;
}

/**
 * Send a fresh OTP. Whether the code is generated locally or by the
 * provider is opaque to callers.
 *
 * Returns a hint at when the code expires — for local providers this is
 * exact; for Twilio it's a UI hint matching their default 10-minute TTL.
 */
export async function issueOtp(
  userId: string,
  phoneInput: string,
): Promise<{ phone: string; expiresAt: Date }> {
  const phone = canonicalisePhone(phoneInput);
  try {
    await getOtpProvider().sendOtp(userId, phone);
  } catch (err) {
    logger.error({ err, phone }, 'OTP send failed');
    throw err;
  }
  return {
    phone,
    expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
  };
}

/**
 * Verify a user-entered code. Returns true on success.
 * Throws AppError on any expected failure mode (the provider does the
 * mapping — invalid / expired / too_many / not_found).
 */
export async function verifyOtp(
  userId: string,
  phoneInput: string,
  code: string,
): Promise<true> {
  const phone = canonicalisePhone(phoneInput);
  return getOtpProvider().verifyOtp(userId, phone, code);
}
