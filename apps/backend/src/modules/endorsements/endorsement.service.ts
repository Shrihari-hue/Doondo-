/**
 * Endorsements service — create, list, summarise per seeker.
 *
 * Gating rule: only an employer who has hired the seeker on at least
 * one application can endorse them. We check by counting Applications
 * with status='hired' for the (employer, seeker) pair.
 *
 * Verified-trade threshold: 3 distinct employers endorsing the same
 * trade flips the seeker into "Verified [trade]" badge territory. This
 * is a cheap consensus signal that survives any single employer
 * gaming the system.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { EndorsementModel, type PublicEndorsement } from './endorsement.model';
import {
  PhotoVerificationModel,
  type PublicPhotoVerification,
} from './photoVerification.model';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';

const VERIFIED_THRESHOLD = 3;

interface CreateInput {
  endorserId: string;
  seekerId: string;
  trade: string;
  applicationId?: string;
}

export async function endorse(input: CreateInput): Promise<PublicEndorsement> {
  if (input.endorserId === input.seekerId) {
    throw errors.forbidden("You can't endorse yourself.");
  }

  // Gate: the endorser must have actually hired this seeker.
  const hiredExists = await ApplicationModel.exists({
    employerId: new Types.ObjectId(input.endorserId),
    seekerId: new Types.ObjectId(input.seekerId),
    status: 'hired',
  });
  if (!hiredExists) {
    throw errors.forbidden(
      'Only employers who have hired this worker can endorse them.',
    );
  }

  const trade = input.trade.trim().toLowerCase();
  if (!trade) {
    throw errors.validation({ trade: input.trade }, 'trade is required');
  }

  try {
    const doc = await EndorsementModel.create({
      endorserId: new Types.ObjectId(input.endorserId),
      seekerId: new Types.ObjectId(input.seekerId),
      trade,
      applicationId: input.applicationId
        ? new Types.ObjectId(input.applicationId)
        : null,
    });

    const endorser = await UserModel.findById(input.endorserId)
      .select('name companyName')
      .lean();

    return doc.toPublicJSON({
      endorserName: endorser?.name ?? 'Doondo employer',
      endorserCompanyName: endorser?.companyName ?? null,
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw errors.conflict("You've already endorsed this worker for this trade.");
    }
    throw err;
  }
}

export interface TradeEndorsementSummary {
  trade: string;
  count: number;
  /** True when count >= VERIFIED_THRESHOLD (default 3). */
  verified: boolean;
}

/**
 * For a seeker, return per-trade endorsement counts. Drives the
 * "✓ Verified [trade]" pill that surfaces on their profile.
 */
export async function summarizeForSeeker(
  seekerId: string,
): Promise<TradeEndorsementSummary[]> {
  const rows = await EndorsementModel.aggregate<{
    _id: string;
    count: number;
  }>([
    { $match: { seekerId: new Types.ObjectId(seekerId) } },
    { $group: { _id: '$trade', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return rows.map((r) => ({
    trade: r._id,
    count: r.count,
    verified: r.count >= VERIFIED_THRESHOLD,
  }));
}

/**
 * Did this employer already endorse this seeker on this trade? Used by
 * the mobile to grey out the "Endorse" button when the action is
 * already done.
 */
export async function hasEndorsed(
  employerId: string,
  seekerId: string,
  trade: string,
): Promise<boolean> {
  const exists = await EndorsementModel.exists({
    endorserId: new Types.ObjectId(employerId),
    seekerId: new Types.ObjectId(seekerId),
    trade: trade.trim().toLowerCase(),
  });
  return !!exists;
}

// ─── Photo verification ─────────────────────────────────────────────────────

interface VerifyPhotoInput {
  employerId: string;
  seekerId: string;
  photoIndex: number;
  applicationId?: string;
}

export async function verifyPhoto(
  input: VerifyPhotoInput,
): Promise<PublicPhotoVerification> {
  if (input.employerId === input.seekerId) {
    throw errors.forbidden("You can't verify your own photos.");
  }
  const hiredExists = await ApplicationModel.exists({
    employerId: new Types.ObjectId(input.employerId),
    seekerId: new Types.ObjectId(input.seekerId),
    status: 'hired',
  });
  if (!hiredExists) {
    throw errors.forbidden(
      'Only employers who have hired this worker can verify their photos.',
    );
  }
  try {
    const doc = await PhotoVerificationModel.create({
      employerId: new Types.ObjectId(input.employerId),
      seekerId: new Types.ObjectId(input.seekerId),
      photoIndex: input.photoIndex,
      applicationId: input.applicationId
        ? new Types.ObjectId(input.applicationId)
        : null,
    });
    const employer = await UserModel.findById(input.employerId)
      .select('name companyName')
      .lean();
    return doc.toPublicJSON({
      employerName: employer?.name ?? 'Doondo employer',
      employerCompanyName: employer?.companyName ?? null,
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw errors.conflict("You've already verified this photo.");
    }
    throw err;
  }
}

export interface PhotoVerificationSummary {
  photoIndex: number;
  count: number;
}

export async function summarizePhotoVerifications(
  seekerId: string,
): Promise<PhotoVerificationSummary[]> {
  const rows = await PhotoVerificationModel.aggregate<{
    _id: number;
    count: number;
  }>([
    { $match: { seekerId: new Types.ObjectId(seekerId) } },
    { $group: { _id: '$photoIndex', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ photoIndex: r._id, count: r.count }));
}
