/**
 * Crew churn early-warning — spot a regular worker drifting away while you
 * can still win them back.
 *
 * A "regular" is someone this employer has hired several times. If they
 * haven't been hired again in a while, they're a churn risk worth a nudge
 * ("Ravi has worked with you 14 times but hasn't in 3 weeks — reach out?").
 * Computed purely from the hires already in the DB; no new tracking.
 */

import { Types } from 'mongoose';
import { ApplicationModel } from '@/modules/applications/application.model';
import { UserModel } from '@/modules/users/user.model';

export interface ChurnRisk {
  workerId: string;
  name: string;
  photoUrl: string | null;
  /** Times this employer has hired them. */
  hireCount: number;
  /** ISO of their most recent hire with this employer. */
  lastHiredAt: string | null;
  /** Whole days since that last hire. */
  daysSince: number;
}

/** A worker counts as a "regular" at this many hires. */
const MIN_HIRES = 3;
/** Days of silence before a regular is flagged as drifting. */
const INACTIVE_DAYS = 21;

export async function getChurnRisks(employerId: string): Promise<ChurnRisk[]> {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  const agg = (await ApplicationModel.aggregate([
    { $match: { employerId: new Types.ObjectId(employerId), status: 'hired' } },
    {
      $group: {
        _id: '$seekerId',
        hireCount: { $sum: 1 },
        lastHiredAt: { $max: { $ifNull: ['$hiredAt', '$appliedAt'] } },
      },
    },
    { $match: { hireCount: { $gte: MIN_HIRES }, lastHiredAt: { $lte: cutoff } } },
    { $sort: { lastHiredAt: 1 } },
    { $limit: 20 },
  ])) as Array<{ _id: Types.ObjectId; hireCount: number; lastHiredAt: Date }>;

  if (agg.length === 0) return [];

  const users = await UserModel.find({ _id: { $in: agg.map((a) => a._id) } })
    .select('name photoUrl')
    .lean();
  const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));

  const now = Date.now();
  return agg
    .map((a) => {
      const u = userMap.get(a._id.toString());
      if (!u) return null;
      const last = a.lastHiredAt ? new Date(a.lastHiredAt) : null;
      return {
        workerId: a._id.toString(),
        name: (u as { name?: string }).name ?? 'Worker',
        photoUrl: (u as { photoUrl?: string | null }).photoUrl ?? null,
        hireCount: a.hireCount,
        lastHiredAt: last ? last.toISOString() : null,
        daysSince: last ? Math.floor((now - last.getTime()) / 86_400_000) : 0,
      } as ChurnRisk;
    })
    .filter((x): x is ChurnRisk => x !== null);
}
