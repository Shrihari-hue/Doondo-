/**
 * "Needs you now" — one prioritized action feed for the employer Home.
 *
 * The employer's attention is scattered across screens: an applicant who's
 * been waiting since yesterday, a worker who countered an offer, a photo
 * proof sitting unreviewed, someone already on their way, a licence about
 * to lapse. This aggregates all of those into a single, ranked list so the
 * Home tab can say "here's what actually needs you, in order" instead of
 * making the employer hunt.
 *
 * It's a read-only roll-up over data the other modules already own —
 * applications (pending / countered offers / on-the-way), work proofs, and
 * crew documents. No new tracking, no new writes.
 *
 * Each item carries enough for the client to deep-link: a `route` hint and,
 * when the item points at exactly one thing, the `applicationId` to open.
 */

import { and, asc, count, eq, gt, isNotNull, lte, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, crewDocuments, users, workProofs } from '@/db/schema';

/** Where a tapped item should take the employer. */
export type NeedsYouNowRoute = 'applicant' | 'applicants' | 'workforce';

export type NeedsYouNowKind =
  | 'worker_on_the_way'
  | 'counter_offer'
  | 'work_proof'
  | 'applicant_waiting'
  | 'expiring_doc';

export interface NeedsYouNowItem {
  kind: NeedsYouNowKind;
  /** How many things this item rolls up. */
  count: number;
  /** A representative name/title for context in the subtitle. */
  sample: string;
  /** Set only when the item targets exactly one application. */
  applicationId: string | null;
  route: NeedsYouNowRoute;
  /** Higher = more urgent; drives ordering. */
  priority: number;
}

export interface NeedsYouNowResult {
  items: NeedsYouNowItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ON_THE_WAY_WINDOW_MS = 12 * 60 * 60 * 1000; // ignore stale en-route flags
const DOC_SOON_MS = 30 * DAY_MS;

interface AppRow {
  id: string;
  status: string;
  createdAt: Date;
  offerStatus: string | null;
  onTheWayStartedAt: Date | null;
  seekerName: string | null;
}

function seekerName(a: AppRow): string {
  return a.seekerName ?? 'Worker';
}

export async function getNeedsYouNow(employerId: string): Promise<NeedsYouNowResult> {
  const db = getDb();
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);
  const onTheWaySince = new Date(now - ON_THE_WAY_WINDOW_MS);

  const [apps, [proofCountRow], proofSampleRows, docs] = await Promise.all([
    db
      .select({
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        offerStatus: applications.offerStatus,
        onTheWayStartedAt: applications.onTheWayStartedAt,
        seekerName: users.name,
      })
      .from(applications)
      .leftJoin(users, eq(users.id, applications.seekerId))
      .where(
        and(
          eq(applications.employerId, employerId),
          or(
            and(eq(applications.status, 'pending'), lte(applications.createdAt, dayAgo)),
            eq(applications.offerStatus, 'countered'),
            isNotNull(applications.onTheWayStartedAt),
          ),
        ),
      ),
    db.select({ n: count() }).from(workProofs).where(and(eq(workProofs.employerId, employerId), eq(workProofs.status, 'submitted'))),
    db
      .select({ applicationId: workProofs.applicationId })
      .from(workProofs)
      .where(and(eq(workProofs.employerId, employerId), eq(workProofs.status, 'submitted')))
      .orderBy(asc(workProofs.submittedAt))
      .limit(1),
    db
      .select({
        label: crewDocuments.label,
        expiresAt: crewDocuments.expiresAt,
        workerName: users.name,
      })
      .from(crewDocuments)
      .leftJoin(users, eq(users.id, crewDocuments.workerId))
      .where(and(eq(crewDocuments.employerId, employerId), lte(crewDocuments.expiresAt, new Date(now + DOC_SOON_MS)))),
  ]);

  const proofCount = proofCountRow!.n;
  const proofSample = proofSampleRows[0] ?? null;

  // Bucket the applications.
  const onTheWay: AppRow[] = [];
  const countered: AppRow[] = [];
  const waiting: AppRow[] = [];
  for (const a of apps) {
    if (a.onTheWayStartedAt && a.onTheWayStartedAt >= onTheWaySince) {
      onTheWay.push(a);
    } else if (a.offerStatus === 'countered') {
      countered.push(a);
    } else if (a.status === 'pending' && a.createdAt <= dayAgo) {
      waiting.push(a);
    }
  }

  const items: NeedsYouNowItem[] = [];

  if (onTheWay.length > 0) {
    const first = onTheWay[0]!;
    items.push({
      kind: 'worker_on_the_way',
      count: onTheWay.length,
      sample: seekerName(first),
      applicationId: onTheWay.length === 1 ? first.id : null,
      route: 'applicant',
      priority: 100,
    });
  }

  if (countered.length > 0) {
    const first = countered[0]!;
    items.push({
      kind: 'counter_offer',
      count: countered.length,
      sample: seekerName(first),
      applicationId: countered.length === 1 ? first.id : null,
      route: 'applicant',
      priority: 90,
    });
  }

  if (proofCount > 0) {
    items.push({
      kind: 'work_proof',
      count: proofCount,
      sample: '',
      applicationId: proofCount === 1 && proofSample ? proofSample.applicationId : null,
      route: 'applicant',
      priority: 80,
    });
  }

  if (waiting.length > 0) {
    const first = waiting[0]!;
    items.push({
      kind: 'applicant_waiting',
      count: waiting.length,
      sample: seekerName(first),
      applicationId: waiting.length === 1 ? first.id : null,
      route: waiting.length === 1 ? 'applicant' : 'applicants',
      priority: 70,
    });
  }

  if (docs.length > 0) {
    const expired = docs.filter((d) => d.expiresAt.getTime() <= now);
    const head = docs[0]!;
    const wname = head.workerName ?? 'Worker';
    items.push({
      kind: 'expiring_doc',
      count: docs.length,
      sample: `${wname} · ${head.label}`,
      applicationId: null,
      route: 'workforce',
      // Already-expired docs are more urgent than merely-soon ones.
      priority: expired.length > 0 ? 65 : 50,
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  return { items };
}
