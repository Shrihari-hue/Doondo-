/**
 * WhatsApp service — thin wrapper over Twilio's Messaging API, plus a
 * persistent log of everything we send and receive.
 *
 * Public surface:
 *   sendTemplate({ to, contentSid, variables })  — for transactional
 *     notifications (hire confirmations, interview reminders, etc.).
 *     Templates must be pre-approved in Twilio (Content Editor). You can
 *     send these *at any time* — they're not subject to the 24h window.
 *
 *   sendText({ to, body })  — freeform reply to a user inside the WhatsApp
 *     24-hour customer-service window. Use this when a support agent
 *     replies to an inbound message. Outside the window, Twilio will
 *     reject — fall back to sendTemplate.
 *
 *   logInbound({...})  — called by the webhook controller to persist
 *     incoming messages. Returns the saved doc so the caller can fan
 *     out (auto-ack, notify support, etc.).
 *
 *   isValidTwilioSignature({...})  — verifies X-Twilio-Signature so a
 *     random attacker can't hit our webhook URL and inject fake "user
 *     wants to opt out" messages.
 *
 * Twilio docs:
 *   Messages API:  https://www.twilio.com/docs/messaging/api/message-resource
 *   WhatsApp:      https://www.twilio.com/docs/whatsapp
 *   Signature:     https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

import crypto from 'crypto';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  WhatsAppMessageModel,
  type WhatsAppMessage,
  type WhatsAppMessageDoc,
  type WhatsAppStatus,
} from './whatsappMessage.model';

// ─── Phone number helpers ──────────────────────────────────────────────

/** Normalises "+14155551234" or "whatsapp:+14155551234" to the wa-prefixed form. */
export function toWhatsAppAddress(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('whatsapp:')) return trimmed;
  if (!trimmed.startsWith('+')) {
    // Best-effort: prepend the default country code so seekers can pass
    // a 10-digit Indian number without thinking about it.
    return `whatsapp:${env.PHONE_DEFAULT_COUNTRY}${trimmed}`;
  }
  return `whatsapp:${trimmed}`;
}

// ─── Config gate ───────────────────────────────────────────────────────

function assertConfigured(): {
  accountSid: string;
  authToken: string;
  from: string;
} {
  if (!env.TWILIO_WHATSAPP_ENABLED) throw errors.whatsappDisabled();
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_WHATSAPP_FROM
  ) {
    throw new Error(
      'WhatsApp is enabled but not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.',
    );
  }
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: toWhatsAppAddress(env.TWILIO_WHATSAPP_FROM),
  };
}

function authHeaders(accountSid: string, authToken: string): Record<string, string> {
  const credential = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return {
    Authorization: `Basic ${credential}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// ─── Outbound: template send ───────────────────────────────────────────
//
// Twilio's Content API lets you send a pre-approved template by SID and
// substitute variables — this is what you use for notifications (hire,
// interview, job alert). Templates must be approved by Meta before they
// can be used in production; sandbox skips approval but limits formatting.

export interface SendTemplateArgs {
  /** Phone in E.164 (+91...) or "whatsapp:+E164" form. */
  to: string;
  /** Twilio Content SID, HX... — from Content Editor in the console. */
  contentSid: string;
  /** Numbered variables, e.g. { "1": "Ravi", "2": "Plumber" }. */
  variables?: Record<string, string>;
  /** Optional Messaging Service SID (MG...) to route via a service. */
  messagingServiceSid?: string;
  /** Doondo user the message is for, if known — links the log row. */
  userId?: string;
}

export async function sendTemplate(
  args: SendTemplateArgs,
): Promise<WhatsAppMessageDoc> {
  const { accountSid, authToken, from } = assertConfigured();
  const to = toWhatsAppAddress(args.to);

  const body = new URLSearchParams({
    From: from,
    To: to,
    ContentSid: args.contentSid,
  });
  if (args.variables && Object.keys(args.variables).length > 0) {
    body.set('ContentVariables', JSON.stringify(args.variables));
  }
  if (args.messagingServiceSid) {
    body.set('MessagingServiceSid', args.messagingServiceSid);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(accountSid, authToken),
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(
      { status: res.status, body: text, to, contentSid: args.contentSid },
      'Twilio WhatsApp template send failed',
    );
    throw errors.whatsappSendFailed(extractFriendlyError(text));
  }

  const json = (await res.json().catch(() => null)) as TwilioMessageResponse | null;
  if (!json?.sid) throw errors.whatsappSendFailed();

  return persistOutbound({
    sid: json.sid,
    from,
    to,
    body: json.body ?? '',
    status: normaliseStatus(json.status),
    contentSid: args.contentSid,
    contentVariables: args.variables ?? null,
    userId: args.userId ?? null,
  });
}

// ─── Outbound: freeform text ───────────────────────────────────────────
//
// Only valid inside the 24-hour customer-service window — i.e. the user
// messaged us within the last 24 hours. Outside that window WhatsApp
// rejects with error 63016 / 63018. The caller should fall back to
// sendTemplate in that case.

export interface SendTextArgs {
  to: string;
  body: string;
  /** Optional media — must be publicly fetchable URLs. */
  mediaUrls?: string[];
  userId?: string;
}

export async function sendText(args: SendTextArgs): Promise<WhatsAppMessageDoc> {
  const { accountSid, authToken, from } = assertConfigured();
  const to = toWhatsAppAddress(args.to);

  if (!args.body.trim() && (args.mediaUrls?.length ?? 0) === 0) {
    throw errors.validation(null, 'WhatsApp message must have body or media.');
  }

  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: args.body,
  });
  args.mediaUrls?.forEach((url) => body.append('MediaUrl', url));

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(accountSid, authToken),
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(
      { status: res.status, body: text, to },
      'Twilio WhatsApp freeform send failed',
    );
    throw errors.whatsappSendFailed(extractFriendlyError(text));
  }

  const json = (await res.json().catch(() => null)) as TwilioMessageResponse | null;
  if (!json?.sid) throw errors.whatsappSendFailed();

  return persistOutbound({
    sid: json.sid,
    from,
    to,
    body: args.body,
    mediaUrls: args.mediaUrls,
    status: normaliseStatus(json.status),
    userId: args.userId ?? null,
  });
}

// ─── Inbound: webhook log ──────────────────────────────────────────────

export interface LogInboundArgs {
  sid: string;
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  userId?: string | null;
}

export async function logInbound(args: LogInboundArgs): Promise<WhatsAppMessageDoc> {
  // Upsert by SID so Twilio retries don't double-write.
  const doc = await WhatsAppMessageModel.findOneAndUpdate(
    { sid: args.sid },
    {
      $setOnInsert: {
        sid: args.sid,
        direction: 'inbound',
        from: args.from,
        to: args.to,
        body: args.body,
        mediaUrls: args.mediaUrls && args.mediaUrls.length > 0 ? args.mediaUrls : undefined,
        status: 'received' as WhatsAppStatus,
        userId: args.userId ?? null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc;
}

// ─── Inbound: status callback (delivered/read/failed) ──────────────────

export async function updateOutboundStatus(args: {
  sid: string;
  status: string;
  errorCode?: number;
  errorMessage?: string;
}): Promise<void> {
  await WhatsAppMessageModel.updateOne(
    { sid: args.sid },
    {
      $set: {
        status: normaliseStatus(args.status),
        ...(args.errorCode !== undefined ? { errorCode: args.errorCode } : {}),
        ...(args.errorMessage !== undefined ? { errorMessage: args.errorMessage } : {}),
      },
    },
  );
}

// ─── Webhook signature validation ──────────────────────────────────────
//
// Twilio signs every webhook request: HMAC-SHA1 over the full URL +
// sorted form-encoded params, base64'd, sent as X-Twilio-Signature.
// Recomputing with our authToken gives the expected signature.
//
// We're recomputing this manually (instead of pulling in the `twilio`
// SDK) to keep the dep surface tight — the algorithm is short and
// stable.

export function isValidTwilioSignature(args: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const { authToken, url, params, signature } = args;
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');
  const data = url + sorted;
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  body?: string;
  error_code?: number | null;
  error_message?: string | null;
}

const STATUS_SET = new Set<WhatsAppStatus>([
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'undelivered',
  'received',
]);

function normaliseStatus(s: string | undefined): WhatsAppStatus {
  if (s && (STATUS_SET as Set<string>).has(s)) return s as WhatsAppStatus;
  return 'queued';
}

async function persistOutbound(args: {
  sid: string;
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  status: WhatsAppStatus;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  userId?: string | null;
}): Promise<WhatsAppMessageDoc> {
  const doc = await WhatsAppMessageModel.create({
    sid: args.sid,
    direction: 'outbound',
    from: args.from,
    to: args.to,
    body: args.body,
    mediaUrls: args.mediaUrls,
    status: args.status,
    contentSid: args.contentSid ?? null,
    contentVariables: args.contentVariables ?? null,
    userId: (args.userId as unknown as WhatsAppMessage['userId']) ?? null,
  });
  return doc;
}

/**
 * Twilio's REST API returns a JSON body like
 *   {"code": 63016, "message": "Failed to send freeform message...", ...}
 * We surface the human-readable bit when we can; everything else falls
 * back to the generic 502 message in whatsappSendFailed().
 */
function extractFriendlyError(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as { code?: number; message?: string };
    if (!parsed?.code) return undefined;
    switch (parsed.code) {
      case 63007:
        return 'WhatsApp channel is not configured for this Twilio number.';
      case 63016:
      case 63018:
        return 'Outside the 24-hour reply window. Send a template instead.';
      case 63017:
        return 'Recipient is not a WhatsApp user.';
      case 63024:
        return 'Recipient has not opted in to receive messages from this sender.';
      default:
        return parsed.message;
    }
  } catch {
    return undefined;
  }
}
