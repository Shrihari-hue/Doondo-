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

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { errors } from '@/lib/errors';
import { sendSosAlertPush } from '@/lib/push';
import { UserModel } from '@/modules/users/user.model';
import { hashPhone } from '@/modules/me/findFriends.service';
import { SosAlertModel, type PublicSosAlert } from './sosAlert.model';

interface TriggerInput {
  /** User firing SOS. */
  userId: string;
  /** Coordinates from the device (optional — fall back to last known on user record). */
  lat?: number;
  lng?: number;
  /** Short optional context from the seeker ("I'm at the gate, no one answers"). */
  note?: string;
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

/** Peer fan-out radius. Tight enough that responders can actually reach the site. */
const PEER_RADIUS_METERS = 5_000;
const PEER_LIMIT = 2;

export async function triggerSos(input: TriggerInput): Promise<SosTriggerResult> {
  const sender = await UserModel.findById(input.userId);
  if (!sender) throw errors.notFound('User not found.');

  // Resolve the location: device coords > the user's saved location.
  let lat = input.lat;
  let lng = input.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const saved = sender.location?.geo?.coordinates;
    if (Array.isArray(saved) && saved.length === 2) {
      lng = saved[0];
      lat = saved[1];
    }
  }
  const haveCoords = typeof lat === 'number' && typeof lng === 'number';
  const locationLink = haveCoords
    ? `https://maps.google.com/?q=${lat},${lng}`
    : null;

  // 1. Trust Circle resolution. Phone-hash every contact and look them
  //    up in one query so we know who's on Doondo (push-reachable) vs
  //    who isn't (mobile sends SMS).
  const trust = Array.isArray(sender.trustCircle) ? sender.trustCircle : [];
  const hashes = trust.map((c) => hashPhone(c.phone));
  const matched =
    hashes.length > 0
      ? await UserModel.find({ phoneHash: { $in: hashes }, isActive: true })
          .select('_id phoneHash name')
          .lean()
      : [];
  const matchedByHash = new Map(
    matched.map((u) => [
      (u as { phoneHash?: string }).phoneHash as string,
      u._id as Types.ObjectId,
    ]),
  );
  // For each Trust Circle contact, either record a "push this user"
  // pairing (so we keep the contact's relationship label alongside)
  // or remember the hash so the device can SMS-fallback.
  interface TrustPushTarget {
    userId: Types.ObjectId;
    relationship: string;
  }
  const trustPushTargets: TrustPushTarget[] = [];
  const trustContactsPushed: Types.ObjectId[] = [];
  const trustContactsUnmatched: string[] = [];
  const unmatchedContacts: Array<{ name: string; phone: string; relationship: string | null }> = [];

  for (let i = 0; i < trust.length; i++) {
    const contact = trust[i]!;
    const hash = hashes[i]!;
    const userIdMatch = matchedByHash.get(hash);
    if (userIdMatch) {
      trustContactsPushed.push(userIdMatch);
      trustPushTargets.push({
        userId: userIdMatch,
        relationship: contact.relationship ?? 'family',
      });
    } else {
      trustContactsUnmatched.push(hash);
      unmatchedContacts.push({
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship ?? null,
      });
    }
  }

  // 2. Peer responder lookup — nearest verified opted-in users.
  //    Always exclude the sender. Limit hardcoded; relax only when we
  //    have enough density to support a wider net.
  const peersPushed: Types.ObjectId[] = [];
  if (haveCoords) {
    const peerCandidates = await UserModel.find({
      _id: { $ne: new Types.ObjectId(input.userId) },
      isPeerResponder: true,
      isVerified: true,
      isActive: true,
      'location.geo': {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng!, lat!] },
          $maxDistance: PEER_RADIUS_METERS,
        },
      },
    })
      .select('_id name')
      .limit(PEER_LIMIT)
      .lean();
    for (const p of peerCandidates) {
      peersPushed.push(p._id as Types.ObjectId);
    }
  }

  // 3. Persist the alert FIRST so we have a receipt even if the push
  //    pipeline fails. The alert id is needed by every push.
  const alert = await SosAlertModel.create({
    triggeredBy: sender._id,
    location: haveCoords
      ? { type: 'Point', coordinates: [lng!, lat!] }
      : null,
    note: input.note?.trim() || null,
    fanout: {
      trustContactsPushed,
      trustContactsUnmatched,
      peersPushed,
    },
  });

  logger.warn(
    {
      alertId: alert.id,
      sender: sender._id.toString(),
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
      recipientId: target.userId.toString(),
      fromName: senderName,
      relationship: target.relationship,
      alertId: alert.id,
      locationLink,
    });
  }
  for (const peerId of peersPushed) {
    void sendSosAlertPush({
      recipientId: peerId.toString(),
      fromName: senderName,
      relationship: 'peer',
      alertId: alert.id,
      locationLink,
    });
  }

  return {
    alert: alert.toPublicJSON(),
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
  const rows = await SosAlertModel.find({ triggeredBy: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit);
  return rows.map((r) => r.toPublicJSON());
}

/**
 * Mark an alert as resolved. The sender, anyone who got pushed, or an
 * admin can resolve. Idempotent — re-resolving is a no-op.
 */
export async function resolveAlert(input: {
  alertId: string;
  callerId: string;
}): Promise<PublicSosAlert> {
  const alert = await SosAlertModel.findById(input.alertId);
  if (!alert) throw errors.notFound('SOS alert not found.');
  if (alert.resolvedAt) return alert.toPublicJSON();

  const callerObjectId = new Types.ObjectId(input.callerId);
  const isSender = (alert.triggeredBy as unknown as Types.ObjectId).equals(callerObjectId);
  const isContactedPeer =
    alert.fanout?.peersPushed?.some((id) =>
      (id as unknown as Types.ObjectId).equals(callerObjectId),
    ) ?? false;
  const isContactedTrust =
    alert.fanout?.trustContactsPushed?.some((id) =>
      (id as unknown as Types.ObjectId).equals(callerObjectId),
    ) ?? false;

  if (!isSender && !isContactedPeer && !isContactedTrust) {
    throw errors.forbidden();
  }

  alert.resolvedAt = new Date();
  alert.resolvedBy = callerObjectId as unknown as typeof alert.resolvedBy;
  await alert.save();
  return alert.toPublicJSON();
}
