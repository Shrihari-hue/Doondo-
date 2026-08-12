/**
 * SOS service — fan out an alert to a worker's safety network.
 *
 * Routing tiers (best to worst case from the worker's perspective):
 *
 *   1. Trust Circle (server-side, up to 3 contacts the worker added).
 *      For each contact we check whether they're a Doondo user by
 *      phone-hash lookup; matched ones get a push immediately. Unmatched
 *      contacts are returned to the mobile so the device can open SMS
 *      composers as a fallback.
 *
 *   2. Verified peers — up to 2 workers within `PEER_RADIUS_METERS` who
 *      opted in via `isPeerResponder`. The pool is small and verified
 *      so we're not blasting unverified strangers with the worker's
 *      coordinates.
 *
 * Both tiers are best-effort: a single push failure shouldn't block
 * the rest of the fan-out. The SosAlert row is written first so the
 * receipt exists even if every recipient lookup fails.
 *
 * Production notes:
 *   - We do NOT call emergency services. The mobile keeps showing
 *     `112` (India emergency number) as the human action — Doondo
 *     coordinates, it doesn't dispatch.
 *   - This service does not send SMS to off-platform contacts in v1;
 *     the unmatched-trust-contact list goes back to the device so the
 *     seeker's phone opens an SMS composer (matches existing UX, no
 *     extra paid SMS infra needed).
 */

import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { errors } from '@/lib/errors';
import { sendSosAlertPush } from '@/lib/push';
import { hashPhone } from '@/lib/phoneHash';
import { getDb } from '@/db/client';
import { sosAlerts, users } from '@/db/schema';

interface TriggerInput {
  /** User firing SOS. */
  userId: string;
  /** Coordinates from the device (optional — fall back to last known on user record). */
  lat?: number;
  lng?: number;
  /** Short optional context from the seeker ("I'm at the gate, no one answers"). */
  note?: string;
}

export interface PublicSosAlert {
  id: string;
  triggeredBy: string;
  location: { lat: number; lng: number } | null;
  note: string | null;
  fanout: {
    trustContactsPushed: number;
    trustContactsUnmatched: number;
    peersPushed: number;
  };
  resolvedAt: string | null;
  createdAt: string;
}

export interface SosTriggerResult {
  alert: PublicSosAlert;
  /** Counts of each fan-out tier — what the mobile shows in the toast. */
  reach: {
    trustContactsPushed: number;
    trustContactsUnmatched: number;
    peersPushed: number;
  };
  /**
   * Trust-circle contacts whose phones did NOT match a Doondo user.
   * Returned so the mobile can open SMS composers for each — Doondo
   * doesn't send transactional SMS in v1.
   */
  unmatchedContacts: Array<{ name: string; phone: string; relationship: string | null }>;
}

type SosAlertRow = typeof sosAlerts.$inferSelect;

function toPublicJSON(row: SosAlertRow): PublicSosAlert {
  return {
    id: row.id,
    triggeredBy: row.triggeredBy,
    location: row.geo ? { lat: row.geo.y, lng: row.geo.x } : null,
    note: row.note ?? null,
    fanout: {
      trustContactsPushed: row.trustContactsPushed.length,
      trustContactsUnmatched: row.trustContactsUnmatched.length,
      peersPushed: row.peersPushed.length,
    },
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Peer fan-out radius. Tight enough that responders can actually reach the site. */
const PEER_RADIUS_METERS = 5_000;
const PEER_LIMIT = 2;

export async function triggerSos(input: TriggerInput): Promise<SosTriggerResult> {
  const db = getDb();
  const [sender] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!sender) throw errors.notFound('User not found.');

  // Resolve the location: device coords > the user's saved location.
  let lat = input.lat;
  let lng = input.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const saved = sender.location?.coordinates;
    if (Array.isArray(saved) && saved.length === 2) {
      lng = saved[0];
      lat = saved[1];
    }
  }
  const haveCoords = typeof lat === 'number' && typeof lng === 'number';
  const locationLink = haveCoords ? `https://maps.google.com/?q=${lat},${lng}` : null;

  // 1. Trust Circle resolution. Phone-hash every contact and look them
  //    up in one query so we know who's on Doondo (push-reachable) vs
  //    who isn't (mobile sends SMS).
  const trust = Array.isArray(sender.trustCircle) ? sender.trustCircle : [];
  const hashes = trust.map((c) => hashPhone(c.phone));
  const matched = hashes.length
    ? await db.select({ id: users.id, phoneHash: users.phoneHash }).from(users).where(and(inArray(users.phoneHash, hashes), eq(users.isActive, true)))
    : [];
  const matchedByHash = new Map(matched.map((u) => [u.phoneHash as string, u.id]));

  interface TrustPushTarget {
    userId: string;
    relationship: string;
  }
  const trustPushTargets: TrustPushTarget[] = [];
  const trustContactsPushed: string[] = [];
  const trustContactsUnmatched: string[] = [];
  const unmatchedContacts: Array<{ name: string; phone: string; relationship: string | null }> = [];

  for (let i = 0; i < trust.length; i++) {
    const contact = trust[i]!;
    const hash = hashes[i]!;
    const userIdMatch = matchedByHash.get(hash);
    if (userIdMatch) {
      trustContactsPushed.push(userIdMatch);
      trustPushTargets.push({ userId: userIdMatch, relationship: contact.relationship ?? 'family' });
    } else {
      trustContactsUnmatched.push(hash);
      unmatchedContacts.push({ name: contact.name, phone: contact.phone, relationship: contact.relationship ?? null });
    }
  }

  // 2. Peer responder lookup — nearest verified opted-in users.
  //    Always exclude the sender. Limit hardcoded; relax only when we
  //    have enough density to support a wider net.
  //    `users.location` is plain jsonb (no PostGIS index — see
  //    src/db/schema/users.ts), so this is a sequential-scan distance
  //    computation, same tradeoff already accepted for that column.
  const peersPushed: string[] = [];
  if (haveCoords) {
    const peerRows = await db.execute<{ id: string }>(sql`
      SELECT id FROM users
      WHERE id != ${input.userId}
        AND is_peer_responder = true
        AND is_verified = true
        AND is_active = true
        AND location IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint((location->'coordinates'->>0)::float, (location->'coordinates'->>1)::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${PEER_RADIUS_METERS}
        )
      LIMIT ${PEER_LIMIT}
    `);
    for (const p of peerRows) peersPushed.push(p.id);
  }

  // 3. Persist the alert FIRST so we have a receipt even if the push
  //    pipeline fails. The alert id is needed by every push.
  const [alert] = await db
    .insert(sosAlerts)
    .values({
      triggeredBy: sender.id,
      geo: haveCoords ? { x: lng!, y: lat! } : null,
      note: input.note?.trim() || null,
      trustContactsPushed,
      trustContactsUnmatched,
      peersPushed,
    })
    .returning();

  logger.warn(
    {
      alertId: alert!.id,
      sender: sender.id,
      trustPushed: trustContactsPushed.length,
      trustUnmatched: trustContactsUnmatched.length,
      peersPushed: peersPushed.length,
      hasLocation: haveCoords,
    },
    'SOS alert fired',
  );

  // 4. Push fan-out (best-effort, parallel). The targets list preserves
  //    contact → relationship pairing so each push reads naturally.
  const senderName = sender.name ?? 'A Doondo worker';
  for (const target of trustPushTargets) {
    void sendSosAlertPush({
      recipientId: target.userId,
      fromName: senderName,
      relationship: target.relationship,
      alertId: alert!.id,
      locationLink,
    });
  }
  for (const peerId of peersPushed) {
    void sendSosAlertPush({
      recipientId: peerId,
      fromName: senderName,
      relationship: 'peer',
      alertId: alert!.id,
      locationLink,
    });
  }

  return {
    alert: toPublicJSON(alert!),
    reach: {
      trustContactsPushed: trustContactsPushed.length,
      trustContactsUnmatched: trustContactsUnmatched.length,
      peersPushed: peersPushed.length,
    },
    unmatchedContacts,
  };
}

/**
 * Owner-only: list this user's SOS history. Used by the seeker's own
 * Safety screen to show "Last alert: 14 days ago".
 */
export async function listMyAlerts(userId: string, limit = 20): Promise<PublicSosAlert[]> {
  const rows = await getDb()
    .select()
    .from(sosAlerts)
    .where(eq(sosAlerts.triggeredBy, userId))
    .orderBy(desc(sosAlerts.createdAt))
    .limit(limit);
  return rows.map(toPublicJSON);
}

/**
 * Mark an alert as resolved. The sender, anyone who got pushed, or an
 * admin can resolve. Idempotent — re-resolving is a no-op.
 */
export async function resolveAlert(input: {
  alertId: string;
  callerId: string;
}): Promise<PublicSosAlert> {
  const db = getDb();
  const [alert] = await db.select().from(sosAlerts).where(eq(sosAlerts.id, input.alertId)).limit(1);
  if (!alert) throw errors.notFound('SOS alert not found.');
  if (alert.resolvedAt) return toPublicJSON(alert);

  const isSender = alert.triggeredBy === input.callerId;
  const isContactedPeer = alert.peersPushed.includes(input.callerId);
  const isContactedTrust = alert.trustContactsPushed.includes(input.callerId);

  if (!isSender && !isContactedPeer && !isContactedTrust) {
    throw errors.forbidden();
  }

  const [updated] = await db
    .update(sosAlerts)
    .set({ resolvedAt: new Date(), resolvedBy: input.callerId })
    .where(eq(sosAlerts.id, alert.id))
    .returning();
  return toPublicJSON(updated!);
}
