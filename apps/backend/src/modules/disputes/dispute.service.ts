/**
 * Dispute service — raise, list, respond to, and resolve hire disputes.
 *
 * Authorisation rule throughout: the caller must be a party to the
 * dispute (its employer or its seeker). The raiser is inferred from the
 * caller's role at raise time and snapshotted onto the dispute.
 *
 * Notifications: the *other* party is told whenever a dispute is raised,
 * answered, or closed, so neither side has to poll. Records are
 * best-effort (see notifications.record).
 */

import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  applications,
  disputes,
  users,
  type DisputeCategory as DbDisputeCategory,
  type DisputeStatus as DbDisputeStatus,
} from '@/db/schema';
import * as notifications from '@/modules/notifications/notification.service';

export type DisputeCategory = DbDisputeCategory;
export type PartyRole = 'employer' | 'seeker';

const MAX_PHOTOS = 3;

export interface PublicDispute {
  id: string;
  applicationId: string;
  jobId: string;
  category: DisputeCategory;
  description: string;
  photoUrls: string[];
  status: DbDisputeStatus;
  raisedByRole: PartyRole;
  /** True when the caller raised this dispute. */
  raisedByMe: boolean;
  counterpartyName: string;
  responses: { byRole: PartyRole; text: string; at: string }[];
  resolution: { outcome: 'resolved' | 'dismissed'; note: string | null; byRole: PartyRole; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

type DisputeRow = typeof disputes.$inferSelect;

function toPublic(d: DisputeRow, callerRole: PartyRole, counterpartyName: string): PublicDispute {
  return {
    id: d.id,
    applicationId: d.applicationId,
    jobId: d.jobId,
    category: d.category,
    description: d.description,
    photoUrls: d.photoUrls,
    status: d.status,
    raisedByRole: d.raisedByRole,
    raisedByMe: d.raisedByRole === callerRole,
    counterpartyName,
    responses: d.responses.map((r) => ({ byRole: r.byRole, text: r.text, at: r.at })),
    resolution: d.resolution
      ? {
          outcome: d.resolution.outcome,
          note: d.resolution.note ?? null,
          byRole: d.resolution.byRole,
          at: d.resolution.at,
        }
      : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** The id of the party who is NOT the caller. */
function otherPartyId(d: DisputeRow, callerRole: PartyRole): string {
  return callerRole === 'employer' ? d.seekerId : d.employerId;
}

async function nameOf(userId: string): Promise<string> {
  const [u] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? 'User';
}

export async function raiseDispute(input: {
  userId: string;
  role: PartyRole;
  applicationId: string;
  category: DisputeCategory;
  description: string;
  photoDataUrls?: string[];
}): Promise<PublicDispute> {
  const [app] = await getDb()
    .select({ employerId: applications.employerId, seekerId: applications.seekerId, jobId: applications.jobId })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!app) {
    throw Object.assign(new Error('Application not found'), { status: 404 });
  }
  const callerIsParty =
    (input.role === 'employer' && app.employerId === input.userId) ||
    (input.role === 'seeker' && app.seekerId === input.userId);
  if (!callerIsParty) {
    throw Object.assign(new Error('Not a party to this hire'), { status: 403 });
  }

  const photos = (input.photoDataUrls ?? [])
    .filter((p) => typeof p === 'string' && p.startsWith('data:image/'))
    .slice(0, MAX_PHOTOS);

  const [created] = await getDb()
    .insert(disputes)
    .values({
      applicationId: input.applicationId,
      jobId: app.jobId,
      employerId: app.employerId,
      seekerId: app.seekerId,
      raisedByRole: input.role,
      category: input.category,
      description: input.description,
      photoUrls: photos,
      status: 'open',
    })
    .returning();
  const doc = created!;

  const counterpartyId = otherPartyId(doc, input.role);
  const [counterpartyName, raiserName] = await Promise.all([
    nameOf(counterpartyId),
    nameOf(input.userId),
  ]);

  void notifications.record({
    recipientId: counterpartyId,
    kind: 'dispute_raised',
    title: 'A dispute was raised',
    body: `${raiserName} raised a dispute about a recent shift. Open it to respond.`,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
  });

  return toPublic(doc, input.role, counterpartyName);
}

export async function listDisputes(input: {
  userId: string;
  role: PartyRole;
  status?: DbDisputeStatus;
  applicationId?: string;
}): Promise<PublicDispute[]> {
  const conditions = [
    eq(input.role === 'employer' ? disputes.employerId : disputes.seekerId, input.userId),
  ];
  if (input.status) conditions.push(eq(disputes.status, input.status));
  if (input.applicationId) conditions.push(eq(disputes.applicationId, input.applicationId));

  const rows = await getDb()
    .select()
    .from(disputes)
    .where(and(...conditions))
    .orderBy(desc(disputes.createdAt))
    .limit(100);
  const out: PublicDispute[] = [];
  for (const d of rows) {
    const counterpartyName = await nameOf(otherPartyId(d, input.role));
    out.push(toPublic(d, input.role, counterpartyName));
  }
  return out;
}

/** Load a dispute the caller is party to, or throw 403/404. */
async function loadOwned(userId: string, role: PartyRole, id: string): Promise<DisputeRow> {
  const [d] = await getDb().select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!d) throw Object.assign(new Error('Dispute not found'), { status: 404 });
  const mineId = role === 'employer' ? d.employerId : d.seekerId;
  if (mineId !== userId) throw Object.assign(new Error('Not your dispute'), { status: 403 });
  return d;
}

export async function getDispute(input: {
  userId: string;
  role: PartyRole;
  id: string;
}): Promise<PublicDispute> {
  const d = await loadOwned(input.userId, input.role, input.id);
  const counterpartyName = await nameOf(otherPartyId(d, input.role));
  return toPublic(d, input.role, counterpartyName);
}

export async function respondToDispute(input: {
  userId: string;
  role: PartyRole;
  id: string;
  text: string;
}): Promise<PublicDispute> {
  const d = await loadOwned(input.userId, input.role, input.id);
  if (d.status === 'resolved' || d.status === 'dismissed') {
    throw Object.assign(new Error('Dispute is closed'), { status: 409 });
  }
  // After a reply, the ball passes to the other side: status reflects who
  // owes the next move relative to the raiser.
  const nextStatus = input.role === d.raisedByRole ? 'open' : 'awaiting_response';
  await getDb()
    .update(disputes)
    .set({
      responses: [...d.responses, { byRole: input.role, text: input.text, at: new Date().toISOString() }],
      status: nextStatus,
    })
    .where(eq(disputes.id, d.id));

  const counterpartyId = otherPartyId(d, input.role);
  const responderName = await nameOf(input.userId);
  void notifications.record({
    recipientId: counterpartyId,
    kind: 'dispute_update',
    title: 'New reply on a dispute',
    body: `${responderName} replied to the dispute.`,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: d.applicationId } },
  });

  return getDispute({ userId: input.userId, role: input.role, id: input.id });
}

export async function resolveDispute(input: {
  userId: string;
  role: PartyRole;
  id: string;
  outcome: 'resolved' | 'dismissed';
  note?: string;
}): Promise<PublicDispute> {
  const d = await loadOwned(input.userId, input.role, input.id);
  if (d.status === 'resolved' || d.status === 'dismissed') {
    throw Object.assign(new Error('Dispute is already closed'), { status: 409 });
  }
  // Only the raiser can withdraw (dismiss) their own dispute; either party
  // can mark it resolved/settled.
  if (input.outcome === 'dismissed' && input.role !== d.raisedByRole) {
    throw Object.assign(new Error('Only the party who raised it can withdraw it'), { status: 403 });
  }
  await getDb()
    .update(disputes)
    .set({
      status: input.outcome,
      resolution: {
        outcome: input.outcome,
        note: input.note ?? null,
        byRole: input.role,
        at: new Date().toISOString(),
      },
    })
    .where(eq(disputes.id, d.id));

  const counterpartyId = otherPartyId(d, input.role);
  const actorName = await nameOf(input.userId);
  void notifications.record({
    recipientId: counterpartyId,
    kind: 'dispute_update',
    title: input.outcome === 'resolved' ? 'A dispute was resolved' : 'A dispute was withdrawn',
    body:
      input.outcome === 'resolved'
        ? `${actorName} marked the dispute resolved.`
        : `${actorName} withdrew the dispute.`,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: d.applicationId } },
  });

  return getDispute({ userId: input.userId, role: input.role, id: input.id });
}
