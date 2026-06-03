/**
 * Squad service — create/list/delete reusable worker groups and deploy a
 * squad to a job (one direct offer per member).
 *
 * Deploy reuses `rehireCrewMember`, which upserts a shortlisted
 * application and attaches a time-boxed offer — exactly the one-tap
 * re-hire path, applied across the whole squad. Per-member failures
 * (already hired, not active, etc.) are collected rather than aborting the
 * batch, so a partial deploy still lands the members it can.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { JobModel } from '@/modules/jobs/job.model';
import { rehireCrewMember } from '@/modules/crew/crew.service';
import { SquadModel } from './squad.model';

const MAX_MEMBERS = 20;

export interface SquadMember {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface PublicSquad {
  id: string;
  name: string;
  members: SquadMember[];
  createdAt: string;
}

async function hydrateMembers(workerIds: Types.ObjectId[]): Promise<SquadMember[]> {
  if (workerIds.length === 0) return [];
  const users = await UserModel.find({ _id: { $in: workerIds } })
    .select('name photoUrl')
    .lean();
  const map = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));
  // Preserve the stored order; drop deleted users.
  return workerIds
    .map((id) => map.get(id.toString()))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({
      id: (u._id as Types.ObjectId).toString(),
      name: (u as { name?: string }).name ?? 'Worker',
      photoUrl: (u as { photoUrl?: string | null }).photoUrl ?? null,
    }));
}

async function toPublic(s: {
  _id: unknown;
  name: string;
  workerIds: Types.ObjectId[];
  createdAt: Date;
}): Promise<PublicSquad> {
  return {
    id: (s._id as Types.ObjectId).toString(),
    name: s.name,
    members: await hydrateMembers(s.workerIds ?? []),
    createdAt: new Date(s.createdAt).toISOString(),
  };
}

export async function createSquad(
  employerId: string,
  name: string,
  workerIds: string[],
): Promise<PublicSquad> {
  const unique = [...new Set(workerIds)].slice(0, MAX_MEMBERS);
  if (unique.length === 0) throw errors.validation(null, 'A squad needs at least one worker.');
  const ids = unique.map((w) => new Types.ObjectId(w));

  const created = await SquadModel.create({
    employerId: new Types.ObjectId(employerId),
    name: name.trim(),
    workerIds: ids,
  });
  return toPublic(created.toObject() as Parameters<typeof toPublic>[0]);
}

export async function listSquads(employerId: string): Promise<PublicSquad[]> {
  const rows = await SquadModel.find({ employerId: new Types.ObjectId(employerId) })
    .sort({ createdAt: -1 })
    .lean();
  return Promise.all(rows.map((r) => toPublic(r as Parameters<typeof toPublic>[0])));
}

export async function deleteSquad(employerId: string, squadId: string): Promise<void> {
  await SquadModel.deleteOne({
    _id: new Types.ObjectId(squadId),
    employerId: new Types.ObjectId(employerId),
  });
}

export interface DeployResult {
  jobId: string;
  deployed: SquadMember[];
  failed: { workerId: string; reason: string }[];
}

export async function deploySquad(
  employerId: string,
  squadId: string,
  jobId: string,
  ttlHours = 24,
): Promise<DeployResult> {
  const squad = await SquadModel.findOne({
    _id: new Types.ObjectId(squadId),
    employerId: new Types.ObjectId(employerId),
  }).lean();
  if (!squad) throw errors.notFound('Squad not found.');

  // Validate the job once up front (rehireCrewMember re-checks per call,
  // but this gives a clean error before fanning out).
  const job = await JobModel.findById(jobId).select('employerId status').lean();
  if (!job) throw errors.jobNotFound();
  if ((job.employerId as unknown as Types.ObjectId).toString() !== employerId) {
    throw errors.forbidden();
  }
  if ((job as { status?: string }).status !== 'active') {
    throw errors.conflict('That job is not active.');
  }

  const workerIds = (squad.workerIds as Types.ObjectId[]) ?? [];
  const memberMap = new Map((await hydrateMembers(workerIds)).map((m) => [m.id, m]));

  const deployed: SquadMember[] = [];
  const failed: { workerId: string; reason: string }[] = [];

  for (const wid of workerIds) {
    const idStr = wid.toString();
    try {
      await rehireCrewMember(employerId, idStr, jobId, ttlHours);
      const m = memberMap.get(idStr);
      if (m) deployed.push(m);
    } catch (err) {
      failed.push({
        workerId: idStr,
        reason: (err as { message?: string })?.message ?? 'Could not offer',
      });
    }
  }

  return { jobId, deployed, failed };
}
