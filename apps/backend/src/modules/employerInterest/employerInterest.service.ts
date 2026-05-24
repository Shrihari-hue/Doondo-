/**
 * EmployerInterest service — the worker→employer inbound-interest flow.
 *
 * `express` upserts the worker's standing interest in an employer (one
 * row per pair, so re-expressing refreshes rather than spams). The
 * employer reads their inbound list with `listForEmployer` and clears
 * rows with `markViewed` / `archive`. `getMine` lets the seeker UI show
 * "interest already sent" without a second guess.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import {
  EmployerInterestModel,
  type EmployerInterestDocument,
  type EmployerInterestStatus,
  type PublicEmployerInterest,
} from './employerInterest.model';
import { UserModel } from '@/modules/users/user.model';
import * as notifications from '@/modules/notifications/notification.service';

// ─── Hydration ───────────────────────────────────────────────────────────────

/** Attach the worker summary + rating in a fixed number of bulk queries. */
async function hydrate(
  docs: EmployerInterestDocument[],
): Promise<PublicEmployerInterest[]> {
  if (docs.length === 0) return [];
  const seekerIds = [...new Set(docs.map((d) => String(d.seekerId)))];

  const seekers = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl isVerified skills')
    .lean();
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds);

  const seekerMap = new Map(seekers.map((s) => [String(s._id), s]));

  return docs.map((doc) => {
    const base = doc.toPublicJSON();
    const seeker = seekerMap.get(base.seekerId);
    if (seeker) {
      const rating = ratingMap.get(base.seekerId);
      base.seeker = {
        id: base.seekerId,
        name: (seeker as { name?: string }).name ?? 'Worker',
        photoUrl: (seeker as { photoUrl?: string | null }).photoUrl ?? null,
        isVerified: Boolean((seeker as { isVerified?: boolean }).isVerified),
        skills: (seeker as { skills?: string[] }).skills ?? [],
        rating:
          rating && rating.count > 0
            ? { avg: rating.avg, count: rating.count }
            : null,
      };
    }
    return base;
  });
}

// ─── Express (worker) ────────────────────────────────────────────────────────

interface ExpressInput {
  seekerId: string;
  employerId: string;
  message?: string | null;
}

export async function express(
  input: ExpressInput,
): Promise<PublicEmployerInterest> {
  if (input.seekerId === input.employerId) {
    throw errors.forbidden('You cannot express interest in yourself.');
  }

  const employer = await UserModel.findById(input.employerId).select(
    'role isActive name',
  );
  if (!employer || employer.role !== 'employer' || !employer.isActive) {
    throw errors.notFound('Employer not found.');
  }

  // Upsert by (seeker, employer) — the unique index guarantees one
  // standing interest per pair. Re-expressing refreshes the message and
  // resets the status to pending so it resurfaces for the employer.
  const doc = await EmployerInterestModel.findOneAndUpdate(
    {
      seekerId: new Types.ObjectId(input.seekerId),
      employerId: new Types.ObjectId(input.employerId),
    },
    {
      $set: {
        message: input.message?.trim() || null,
        status: 'pending',
        viewedAt: null,
      },
      $setOnInsert: {
        seekerId: new Types.ObjectId(input.seekerId),
        employerId: new Types.ObjectId(input.employerId),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!doc) throw errors.internal();

  // Notify the employer — best-effort.
  const seeker = await UserModel.findById(input.seekerId)
    .select('name photoUrl')
    .lean();
  const seekerName = (seeker as { name?: string } | null)?.name ?? 'A worker';
  await notifications.record({
    recipientId: input.employerId,
    kind: 'employer_interest',
    title: 'A worker is interested in you',
    body: `${seekerName} would like to work for you.`,
    deeplink: { screen: 'InterestedWorkers' },
    imageUrl: (seeker as { photoUrl?: string | null } | null)?.photoUrl ?? null,
  });

  const [pub] = await hydrate([doc]);
  return pub ?? doc.toPublicJSON();
}

// ─── Lists / reads ───────────────────────────────────────────────────────────

/** Employer inbound list — workers who expressed interest in this employer. */
export async function listForEmployer(
  employerId: string,
  statusFilter?: EmployerInterestStatus,
): Promise<PublicEmployerInterest[]> {
  const query: Record<string, unknown> = {
    employerId: new Types.ObjectId(employerId),
  };
  if (statusFilter) query.status = statusFilter;
  const docs = await EmployerInterestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(100);
  return hydrate(docs);
}

/** The seeker's own interest in one employer — null if they haven't raised it. */
export async function getMine(input: {
  seekerId: string;
  employerId: string;
}): Promise<PublicEmployerInterest | null> {
  const doc = await EmployerInterestModel.findOne({
    seekerId: new Types.ObjectId(input.seekerId),
    employerId: new Types.ObjectId(input.employerId),
  });
  return doc ? doc.toPublicJSON() : null;
}

// ─── Employer mutations ──────────────────────────────────────────────────────

async function loadOwned(
  interestId: string,
  employerId: string,
): Promise<EmployerInterestDocument> {
  const doc = await EmployerInterestModel.findById(interestId);
  if (!doc) throw errors.notFound('Interest not found.');
  if (String(doc.employerId) !== employerId) {
    throw errors.forbidden('This interest is not addressed to you.');
  }
  return doc;
}

export async function markViewed(input: {
  interestId: string;
  employerId: string;
}): Promise<PublicEmployerInterest> {
  const doc = await loadOwned(input.interestId, input.employerId);
  if (doc.status === 'pending') {
    const updated = await EmployerInterestModel.findByIdAndUpdate(
      doc._id,
      { $set: { status: 'viewed', viewedAt: new Date() } },
      { new: true },
    );
    if (updated) return (await hydrate([updated]))[0] ?? updated.toPublicJSON();
  }
  return (await hydrate([doc]))[0] ?? doc.toPublicJSON();
}

export async function archive(input: {
  interestId: string;
  employerId: string;
}): Promise<PublicEmployerInterest> {
  const doc = await loadOwned(input.interestId, input.employerId);
  const updated = await EmployerInterestModel.findByIdAndUpdate(
    doc._id,
    { $set: { status: 'archived' } },
    { new: true },
  );
  if (!updated) throw errors.internal();
  return (await hydrate([updated]))[0] ?? updated.toPublicJSON();
}

// ─── Withdraw (worker) ───────────────────────────────────────────────────────

export async function withdraw(input: {
  seekerId: string;
  employerId: string;
}): Promise<void> {
  await EmployerInterestModel.deleteOne({
    seekerId: new Types.ObjectId(input.seekerId),
    employerId: new Types.ObjectId(input.employerId),
  });
}
