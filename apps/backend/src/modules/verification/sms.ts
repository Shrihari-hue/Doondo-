/**
 * OtpProvider — unified abstraction for "deliver an OTP and later verify it".
 *
 * Two architectures live behind this interface:
 *
 *   Local (console / MSG91 raw SMS):
 *     - We generate the code, hash it, and store in OtpChallenge.
 *     - The provider just *delivers* the code (or logs it in dev).
 *     - Verify is a bcrypt comparison against our stored hash.
 *
 *   External (Twilio Verify):
 *     - Twilio owns the entire OTP lifecycle. We never see the plaintext code,
 *       never store anything, and just call Twilio's REST API for both
 *       "send" and "check".
 *
 * The verification.service.ts orchestrates the user-facing flow and is
 * blissfully unaware of which provider is in play.
 *
 * Adding a new provider: implement OtpProvider, register it in pickProvider().
 */

import bcrypt from 'bcrypt';
import { env, isProduction } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { OtpChallengeModel } from './otpChallenge.model';

export interface OtpProvider {
  /**
   * Deliver an OTP to the phone number. The provider decides whether to
   * generate the code or delegate to a third party. Throws on transport
   * failure.
   */
  sendOtp(userId: string, phone: string): Promise<void>;
  /**
   * Verify a user-entered code. Returns true on match.
   * Throws AppError on any expected failure (wrong / expired / exhausted).
   */
  verifyOtp(userId: string, phone: string, code: string): Promise<true>;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const OTP_LENGTH = 6;

function generateCode(): string {
  // Math.random is fine for a 6-digit, 10-min, 5-attempt OTP that's
  // bcrypt-hashed at rest. Switch to crypto.randomInt if compliance demands it.
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// ─── Local provider — BYO storage via OtpChallenge ─────────────────────
// Used by:
//   - 'console' (dev): the sender just logs the code
//   - 'msg91'  (prod India): the sender hits MSG91's transactional SMS API

type RawSender = (phone: string, code: string) => Promise<void>;

class LocalOtpProvider implements OtpProvider {
  constructor(private deliver: RawSender) {}

  async sendOtp(userId: string, phone: string): Promise<void> {
    // Invalidate prior pending challenges so attempts can't carry over.
    await OtpChallengeModel.updateMany(
      { userId, phone, consumed: false },
      { $set: { consumed: true } },
    );

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

    await OtpChallengeModel.create({
      userId,
      phone,
      codeHash,
      attempts: 0,
      consumed: false,
      expiresAt,
    });

    await this.deliver(phone, code);
  }

  async verifyOtp(userId: string, phone: string, code: string): Promise<true> {
    const challenge = await OtpChallengeModel.findOne({
      userId,
      phone,
      consumed: false,
    })
      .select('+codeHash')
      .sort({ createdAt: -1 });

    if (!challenge) throw errors.otpNotFound();

    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.consumed = true;
      await challenge.save();
      throw errors.otpExpired();
    }

    if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) {
      challenge.consumed = true;
      await challenge.save();
      throw errors.otpTooMany();
    }

    challenge.attempts += 1;

    const ok = await bcrypt.compare(code.trim(), challenge.codeHash);
    if (!ok) {
      await challenge.save();
      if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) throw errors.otpTooMany();
      throw errors.otpInvalid();
    }

    challenge.consumed = true;
    await challenge.save();
    return true;
  }
}

// ─── Console sender — dev only ─────────────────────────────────────────
// Loud and obvious in the terminal so you can read the code off the logs.

const consoleSender: RawSender = async (phone, code) => {
  logger.info(
    { phone, code, provider: 'console' },
    `📱  OTP for ${phone} → ${code}`,
  );
};

// ─── MSG91 raw-SMS sender ──────────────────────────────────────────────
// Sends a transactional SMS with the OTP via MSG91. Storage + verification
// stays in OtpChallenge — only delivery is outsourced. (MSG91 also has a
// dedicated OTP API; we'd switch to that later if we want resend/retry on
// MSG91's side.)

const msg91Sender: RawSender = async (phone, code) => {
  if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) {
    throw new Error(
      'MSG91 not configured. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.',
    );
  }
  const mobile = phone.startsWith('+') ? phone.slice(1) : phone;
  const url = 'https://control.msg91.com/api/v5/otp';
  const params = new URLSearchParams({
    template_id: env.MSG91_TEMPLATE_ID,
    mobile,
    authkey: env.MSG91_AUTH_KEY,
    otp: code,
    sender: env.MSG91_SENDER_ID,
  });

  const res = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MSG91 send failed (${res.status}): ${body}`);
  }
  const json = (await res.json().catch(() => null)) as
    | { type?: string; message?: string }
    | null;
  if (json?.type !== 'success') {
    throw new Error(`MSG91 reported failure: ${json?.message ?? 'unknown'}`);
  }
};

// ─── Twilio Verify provider ────────────────────────────────────────────
// Delegates the entire OTP lifecycle to Twilio's Verify service. We never
// see the plaintext code; Twilio handles delivery, attempts, and TTL.
//
// Endpoints used (Verify v2):
//   POST /v2/Services/{Sid}/Verifications      — start (sends the SMS)
//   POST /v2/Services/{Sid}/VerificationCheck  — check
//
// Auth is HTTP Basic with AccountSid:AuthToken.

class TwilioVerifyProvider implements OtpProvider {
  private headers: Record<string, string>;

  constructor(
    private accountSid: string,
    authToken: string,
    private serviceSid: string,
  ) {
    const credential = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    this.headers = {
      Authorization: `Basic ${credential}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  async sendOtp(_userId: string, phone: string): Promise<void> {
    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/Verifications`;
    const body = new URLSearchParams({ To: phone, Channel: 'sms' });
    const res = await fetch(url, { method: 'POST', headers: this.headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text, phone },
        'Twilio Verify send failed',
      );
      // 429 → too many sends in the rolling window
      if (res.status === 429) throw errors.rateLimited('SMS rate limit reached.');

      // Map Twilio's documented error codes to user-actionable messages.
      // Codes are stable per https://www.twilio.com/docs/api/errors.
      // 21608 — "phone number unverified" (trial-account guardrail)
      if (text.includes('21608')) {
        throw errors.rateLimited(
          'This number isn\'t verified on the SMS provider yet. Verify it in the Twilio console first, or upgrade the trial account.',
        );
      }
      // 60200 — invalid phone format
      if (text.includes('60200')) {
        throw errors.validation(null, 'That phone number isn\'t valid. Check the country code.');
      }
      // 60203 — max send attempts (Verify-side throttle)
      if (text.includes('60203')) {
        throw errors.rateLimited(
          'Too many code requests for this number. Try again in a few minutes.',
        );
      }
      // 60410 — landline / unreachable carrier
      if (text.includes('60410')) {
        throw errors.validation(
          null,
          'We can\'t deliver SMS to this number. Try a mobile number instead.',
        );
      }
      throw new Error(`Twilio Verify send failed (${res.status})`);
    }
  }

  async verifyOtp(
    _userId: string,
    phone: string,
    code: string,
  ): Promise<true> {
    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/VerificationCheck`;
    const body = new URLSearchParams({ To: phone, Code: code.trim() });
    const res = await fetch(url, { method: 'POST', headers: this.headers, body });

    // Twilio returns 404 if the verification is gone (already approved,
    // expired, or never existed). Treat as "no active code".
    if (res.status === 404) throw errors.otpNotFound();

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text, phone },
        'Twilio Verify check failed',
      );
      // 60202 = max check attempts reached.
      if (text.includes('60202')) throw errors.otpTooMany();
      throw new Error(`Twilio Verify check failed (${res.status})`);
    }

    const json = (await res.json().catch(() => null)) as
      | { status?: string; valid?: boolean }
      | null;

    if (json?.status === 'approved') return true;
    // Anything else (status='pending' or 'canceled') → user typed wrong code.
    throw errors.otpInvalid();
  }
}

// ─── Picker ────────────────────────────────────────────────────────────

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;

  switch (env.SMS_PROVIDER) {
    case 'twilio': {
      if (
        !env.TWILIO_ACCOUNT_SID ||
        !env.TWILIO_AUTH_TOKEN ||
        !env.TWILIO_VERIFY_SERVICE_SID
      ) {
        throw new Error(
          'Twilio Verify not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.',
        );
      }
      cached = new TwilioVerifyProvider(
        env.TWILIO_ACCOUNT_SID,
        env.TWILIO_AUTH_TOKEN,
        env.TWILIO_VERIFY_SERVICE_SID,
      );
      break;
    }
    case 'msg91':
      cached = new LocalOtpProvider(msg91Sender);
      break;
    case 'console':
    default:
      // Refuse to ship the console provider — OTPs landing in CloudWatch
      // instead of phones is the worst kind of silent failure.
      if (isProduction) {
        throw new Error(
          'SMS_PROVIDER=console is not allowed in production. Configure twilio or msg91.',
        );
      }
      cached = new LocalOtpProvider(consoleSender);
      break;
  }
  return cached;
}

/**
 * Test helper — let tests inject a fake provider and reset between cases.
 * Not used in app code.
 */
export function __setOtpProviderForTests(p: OtpProvider | null): void {
  cached = p;
}
