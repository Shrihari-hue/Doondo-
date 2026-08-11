/**
 * WhatsApp controller.
 *
 * Public endpoints (mounted at /api/v1/whatsapp):
 *
 *   POST /webhook              — Twilio's inbound message webhook. Twilio
 *                                expects a 200 with a TwiML body (empty
 *                                <Response/> is fine) or a JSON 204. We
 *                                return TwiML so an auto-reply could be
 *                                added later without a code change.
 *
 *   POST /status               — Twilio's delivery-status callback.
 *                                Used to track outbound message lifecycle
 *                                (delivered / read / failed).
 *
 *   POST /send-text            — Admin: send a freeform WhatsApp message
 *                                inside the 24h window. Requires
 *                                requireRole('admin') in the router.
 *
 *   POST /send-template        — Admin/system: send a Content template.
 *
 *   GET  /inbox                — Admin: list recent messages, filterable
 *                                by direction or phone.
 *
 * Webhook signature is validated using X-Twilio-Signature; toggle off
 * with TWILIO_WEBHOOK_VALIDATE=false for tunnel / dev work.
 */

import type { Request, Response, NextFunction } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as service from './whatsapp.service';
import { getDb } from '@/db/client';
import { whatsappMessages } from '@/db/schema';

// ─── Send (admin) ──────────────────────────────────────────────────────

export async function sendTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { to, contentSid, variables, userId } = req.body as {
      to: string;
      contentSid: string;
      variables?: Record<string, string>;
      userId?: string;
    };
    const doc = await service.sendTemplate({ to, contentSid, variables, userId });
    res.status(201).json({
      ok: true,
      data: {
        sid: doc.sid,
        status: doc.status,
        to: doc.to,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendText(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { to, body, mediaUrls, userId } = req.body as {
      to: string;
      body: string;
      mediaUrls?: string[];
      userId?: string;
    };
    const doc = await service.sendText({ to, body, mediaUrls, userId });
    res.status(201).json({
      ok: true,
      data: { sid: doc.sid, status: doc.status, to: doc.to },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Inbox (admin) ─────────────────────────────────────────────────────

export async function listMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const direction = req.query.direction as 'inbound' | 'outbound' | undefined;
    const fromRaw = req.query.from as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw))) : 50;

    const conditions = [];
    if (direction) conditions.push(eq(whatsappMessages.direction, direction));
    if (fromRaw) conditions.push(eq(whatsappMessages.from, service.toWhatsAppAddress(fromRaw)));

    const rows = await getDb()
      .select()
      .from(whatsappMessages)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(limit);

    res.json({
      ok: true,
      data: { messages: rows },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Inbound webhook ───────────────────────────────────────────────────

export async function inboundWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!ensureSignature(req)) {
      throw errors.whatsappInvalidSignature();
    }

    const sid = (req.body.MessageSid ?? '').toString();
    const from = (req.body.From ?? '').toString();
    const to = (req.body.To ?? '').toString();
    const body = (req.body.Body ?? '').toString();

    const numMedia = Number(req.body.NumMedia ?? 0);
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const u = req.body[`MediaUrl${i}`];
      if (typeof u === 'string' && u) mediaUrls.push(u);
    }

    if (!sid || !from || !to) {
      logger.warn({ body: req.body }, 'Twilio inbound webhook missing fields');
      // Still 200 so Twilio doesn't retry endlessly.
      res.type('text/xml').send('<Response/>');
      return;
    }

    await service.logInbound({ sid, from, to, body, mediaUrls });

    logger.info(
      { sid, from, body: body.slice(0, 200) },
      'WhatsApp inbound message',
    );

    // Empty TwiML — no automatic reply. Add <Message>...</Message> here
    // later if you want an auto-ack like "We got your message, we'll
    // reply within X hours."
    res.type('text/xml').send('<Response/>');
  } catch (err) {
    next(err);
  }
}

// ─── Status callback ───────────────────────────────────────────────────

export async function statusCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!ensureSignature(req)) {
      throw errors.whatsappInvalidSignature();
    }

    const sid = (req.body.MessageSid ?? '').toString();
    const status = (req.body.MessageStatus ?? '').toString();
    const errorCode = req.body.ErrorCode ? Number(req.body.ErrorCode) : undefined;
    const errorMessage = req.body.ErrorMessage
      ? req.body.ErrorMessage.toString()
      : undefined;

    if (sid && status) {
      await service.updateOutboundStatus({ sid, status, errorCode, errorMessage });
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Validate Twilio's X-Twilio-Signature header against the request URL +
 * form body. Returns false on any failure so callers can map to a 401.
 *
 * In dev (TWILIO_WEBHOOK_VALIDATE=false) we skip the check so a tunnel
 * (ngrok) URL works without faffing.
 *
 * NOTE: Twilio webhook signatures are HMAC'd with the AccountSid's
 * AuthToken specifically — API Keys cannot be used here. So even if the
 * rest of the app authenticates Twilio API calls via TWILIO_API_KEY_SID +
 * SECRET, you must still set TWILIO_AUTH_TOKEN if you want to validate
 * inbound webhooks.
 */
function ensureSignature(req: Request): boolean {
  if (!env.TWILIO_WEBHOOK_VALIDATE) return true;
  if (!env.TWILIO_AUTH_TOKEN) return false;

  const signature = req.header('x-twilio-signature') ?? '';
  if (!signature) return false;

  // Reconstruct the full URL Twilio used. Honour the forwarded proto/host
  // headers (Fly / nginx / Cloudflare) since req.protocol / req.host alone
  // give the internal scheme.
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ??
    req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host') ?? '';
  const url = `${proto}://${host}${req.originalUrl}`;

  // Coerce all body values to strings — Twilio always posts strings.
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (v !== undefined && v !== null) params[k] = String(v);
  }

  return service.isValidTwilioSignature({
    authToken: env.TWILIO_AUTH_TOKEN,
    url,
    params,
    signature,
  });
}
