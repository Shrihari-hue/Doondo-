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

import { Types } from 'mongoose';
import { ApplicationModel } from '@/modules/applications/application.model';
import { WorkProofModel } from '@/modules/workProof/workProof.model';
import { CrewDocumentModel } from '@/modules/crewDocuments/crewDocument.model';

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

/** Shape we read off a lean, populated application. */
interface LeanApp {
  _id: Types.ObjectId;
  status: string;
  createdAt: Date;
  offer?: { outcome?: string } | null;
  onTheWay?: { startedAt?: Date } | null;
  seekerId?: { name?: string } | Types.ObjectId | null;
}

function seekerName(a: LeanApp): string {
  const s = a.seekerId;
  if (s && typeof s === 'object' && 'name' in s && typeof s.name === 'string') {
    return s.name;
  }
  return 'Worker';
}

export async function getNeedsYouNow(employerId: string): Promise<NeedsYouNowResult> {
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);
  const onTheWaySince = new Date(now - ON_THE_WAY_WINDOW_MS);
  const empId = new Types.ObjectId(employerId);

  const [apps, proofCount, proofSample, docs] = await Promise.all([
    ApplicationModel.find({
      employerId: empId,
      $or: [
        { status: 'pending', createdAt: { $lte: dayAgo } },
        { 'offer.outcome': 'countered' },
        { onTheWay: { $ne: null } },
      ],
    })
      .select('status createdAt offer onTheWay seekerId')
      .populate('seekerId', 'name')
      .lean<LeanApp[]>(),
    WorkProofModel.countDocuments({ employerId: empId, status: 'submitted' }),
    WorkProofModel.findOne({ employerId: empId, status: 'submitted' })
      .sort({ submittedAt: 1 })
      .select('applicationId')
      .lean<{ applicationId: Types.ObjectId } | null>(),
    CrewDocumentModel.find({ employerId: empId, expiresAt: { $lte: new Date(now + DOC_SOON_MS) } })
      .select('label expiresAt workerId')
      .populate('workerId', 'name')
      .lean<{ label: string; expiresAt: Date; workerId?: { name?: string } | Types.ObjectId }[]>(),
  ]);

  // Bucket the applications.
  const onTheWay: LeanApp[] = [];
  const countered: LeanApp[] = [];
  const waiting: LeanApp[] = [];
  for (const a of apps) {
    if (a.onTheWay?.startedAt && new Date(a.onTheWay.startedAt) >= onTheWaySince) {
      onTheWay.push(a);
    } else if (a.offer?.outcome === 'countered') {
      countered.push(a);
    } else if (a.status === 'pending' && new Date(a.createdAt) <= dayAgo) {
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
      applicationId: onTheWay.length === 1 ? first._id.toString() : null,
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
      applicationId: countered.length === 1 ? first._id.toString() : null,
      route: 'applicant',
      priority: 90,
    });
  }

  if (proofCount > 0) {
    items.push({
      kind: 'work_proof',
      count: proofCount,
      sample: '',
      applicationId: proofCount === 1 && proofSample ? proofSample.applicationId.toString() : null,
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
      applicationId: waiting.length === 1 ? first._id.toString() : null,
      route: waiting.length === 1 ? 'applicant' : 'applicants',
      priority: 70,
    });
  }

  if (docs.length > 0) {
    const expired = docs.filter((d) => new Date(d.expiresAt).getTime() <= now);
    const head = docs[0]!;
    const w = head.workerId;
    const wname =
      w && typeof w === 'object' && 'name' in w && typeof w.name === 'string' ? w.name : 'Worker';
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
