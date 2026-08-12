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

import { and, desc, eq, inArray } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { jobs, squads, users } from '@/db/schema';
import { rehireCrewMember } from '@/modules/crew/crew.service';

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

async function hydrateMembers(workerIds: string[]): Promise<SquadMember[]> {
  if (workerIds.length === 0) return [];
  const rows = await getDb().select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, workerIds));
  const map = new Map(rows.map((u) => [u.id, u]));
  // Preserve the stored order; drop deleted users.
  return workerIds
    .map((id) => map.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, name: u.name ?? 'Worker', photoUrl: u.photoUrl ?? null }));
}

async function toPublic(s: { id: string; name: string; workerIds: string[]; createdAt: Date }): Promise<PublicSquad> {
  return {
    id: s.id,
    name: s.name,
    members: await hydrateMembers(s.workerIds ?? []),
    createdAt: s.createdAt.toISOString(),
  };
}

export async function createSquad(
  employerId: string,
  name: string,
  workerIds: string[],
): Promise<PublicSquad> {
  const unique = [...new Set(workerIds)].slice(0, MAX_MEMBERS);
  if (unique.length === 0) throw errors.validation(null, 'A squad needs at least one worker.');

  const [created] = await getDb()
    .insert(squads)
    .values({ employerId, name: name.trim(), workerIds: unique })
    .returning();
  return toPublic(created!);
}

export async function listSquads(employerId: string): Promise<PublicSquad[]> {
  const rows = await getDb().select().from(squads).where(eq(squads.employerId, employerId)).orderBy(desc(squads.createdAt));
  return Promise.all(rows.map((r) => toPublic(r)));
}

export async function deleteSquad(employerId: string, squadId: string): Promise<void> {
  await getDb().delete(squads).where(and(eq(squads.id, squadId), eq(squads.employerId, employerId)));
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
  const db = getDb();
  const [squad] = await db.select().from(squads).where(and(eq(squads.id, squadId), eq(squads.employerId, employerId))).limit(1);
  if (!squad) throw errors.notFound('Squad not found.');

  // Validate the job once up front (rehireCrewMember re-checks per call,
  // but this gives a clean error before fanning out).
  const [job] = await db.select({ employerId: jobs.employerId, status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) {
    throw errors.forbidden();
  }
  if (job.status !== 'active') {
    throw errors.conflict('That job is not active.');
  }

  const workerIds = squad.workerIds ?? [];
  const memberMap = new Map((await hydrateMembers(workerIds)).map((m) => [m.id, m]));

  const deployed: SquadMember[] = [];
  const failed: { workerId: string; reason: string }[] = [];

  for (const idStr of workerIds) {
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
