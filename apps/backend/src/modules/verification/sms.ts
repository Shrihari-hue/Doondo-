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

  /**
   * Auth can be either:
   *   { kind: 'token', authToken }   — legacy Account SID + Auth Token
   *   { kind: 'apiKey', sid, secret } — API Key SID + secret (recommended)
   *
   * Twilio accepts either as HTTP Basic; we just pick the right username
   * for the credential.
   */
  constructor(
    private accountSid: string,
    auth:
      | { kind: 'token'; authToken: string }
      | { kind: 'apiKey'; sid: string; secret: string },
    private serviceSid: string,
  ) {
    const [user, pass] =
      auth.kind === 'apiKey'
        ? [auth.sid, auth.secret]
        : [accountSid, auth.authToken];
    const credential = Buffer.from(`${user}:${pass}`).toString('base64');
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
      // Twilio always returns JSON with `code` + `message`. Parse it instead
      // of substring-matching the raw body so we surface the exact code in
      // the logs and never confuse e.g. "21608" appearing inside an error
      // about a different code.
      const parsed = parseTwilioError(text);
      const code = parsed?.code;
      const detail = parsed?.message;

      // 429 → too many sends in the rolling window
      if (res.status === 429) throw errors.rateLimited('SMS rate limit reached.');

      // Map Twilio's documented error codes to user-actionable messages.
      // Reference: https://www.twilio.com/docs/api/errors.
      switch (code) {
        // ─── Trial-account guardrails ──────────────────────────────────
        // 21608 — Messages API: "phone number unverified" (trial accounts
        //         can only SMS Verified Caller IDs).
        // 60330 — Verify API equivalent of the trial-account block.
        // 60600 / 60601 — Verify Service / sub-resource is misconfigured
        //         or the trial account can't reach this country/channel.
        case 21608:
        case 60330:
        case 60600:
        case 60601:
          throw errors.rateLimited(
            "This number isn't on the SMS provider's allow-list. On a Twilio trial account, only numbers added under Phone Numbers → Verified Caller IDs receive SMS. Upgrade the account or add this number to that list.",
          );
        // ─── Format / validity ─────────────────────────────────────────
        case 60200:
          throw errors.validation(
            null,
            "That phone number isn't valid. Check the country code.",
          );
        // 60203 — max send attempts (Verify-side throttle)
        case 60203:
          throw errors.rateLimited(
            'Too many code requests for this number. Try again in a few minutes.',
          );
        // 60410 — landline / unreachable carrier
        case 60410:
          throw errors.validation(
            null,
            "We can't deliver SMS to this number. Try a mobile number instead.",
          );
        // 60005 — Verify destination not allowed (geo permissions / DLT
        //         registration missing in India).
        case 60005:
          throw errors.rateLimited(
            "SMS to this country isn't enabled on the provider. Check geographic permissions (and DLT registration for India) in the Twilio console.",
          );
        // 20003 — auth credentials wrong (this should never happen at
        //         runtime but if it does, surface it clearly).
        case 20003:
          throw new Error(
            'Twilio authentication failed. TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are wrong.',
          );
      }

      // HTTP-level signals when we couldn't parse the code.
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Twilio rejected the request (${res.status}). Check TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in .env.`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `Twilio Verify Service not found (${res.status}). Check TWILIO_VERIFY_SERVICE_SID in .env.`,
        );
      }

      throw new Error(
        `Twilio Verify send failed (${res.status})${code ? ` code=${code}` : ''}${detail ? `: ${detail}` : ''}`,
      );
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
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_VERIFY_SERVICE_SID) {
        throw new Error(
          'Twilio Verify not configured. Set TWILIO_ACCOUNT_SID and TWILIO_VERIFY_SERVICE_SID.',
        );
      }
      // Prefer API key auth when present (scopeable + rotatable).
      // Fall back to AccountSid + AuthToken for backwards compatibility.
      const auth =
        env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET
          ? ({
              kind: 'apiKey',
              sid: env.TWILIO_API_KEY_SID,
              secret: env.TWILIO_API_KEY_SECRET,
            } as const)
          : env.TWILIO_AUTH_TOKEN
            ? ({ kind: 'token', authToken: env.TWILIO_AUTH_TOKEN } as const)
            : null;
      if (!auth) {
        throw new Error(
          'Twilio Verify auth not configured. Set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN.',
        );
      }
      cached = new TwilioVerifyProvider(
        env.TWILIO_ACCOUNT_SID,
        auth,
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

/**
 * Twilio's REST API returns errors as JSON:
 *   { "code": 21608, "message": "…", "more_info": "…", "status": 400 }
 * Parsing this gives us a stable diagnostic in the logs instead of
 * substring-matching the raw body (which could miss the code if Twilio's
 * message formatting changes).
 */
function parseTwilioError(
  rawBody: string,
): { code: number; message: string } | null {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody) as { code?: number; message?: string };
    if (typeof parsed.code !== 'number') return null;
    return { code: parsed.code, message: parsed.message ?? '' };
  } catch {
    return null;
  }
}
