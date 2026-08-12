/**
 * Crew service — list the employer's saved workers, and import phone
 * contacts by matching numbers to existing Doondo workers.
 *
 * Phone matching is by the last 10 digits (India mobile numbers), which
 * sidesteps the +91 / 0-prefix / spacing variation in how numbers are
 * stored vs. how a phone's address book formats them. For each contact we
 * generate the common stored variants and query users in one shot.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, crewMembers, jobs, users } from '@/db/schema';
import { makeOffer } from '@/modules/applications/application.service';

export interface CrewWorker {
  id: string;
  name: string;
  photoUrl: string | null;
  skills: string[];
  isVerified: boolean;
}

export interface ContactInput {
  name: string;
  phone: string;
}

export interface ImportResult {
  /** Contacts matched to a Doondo worker and added to the crew. */
  added: CrewWorker[];
  /** Contacts with no Doondo account — candidates to invite. */
  notOnDoondo: ContactInput[];
}

/** Last 10 digits of a phone string, or '' if fewer than 10 digits. */
function last10(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Common stored formats for a 10-digit Indian mobile number. */
function variants(ten: string): string[] {
  return [ten, `+91${ten}`, `91${ten}`, `0${ten}`, `+91 ${ten}`];
}

function toCrewWorker(u: {
  id: string;
  name: string;
  photoUrl: string | null;
  skills: string[];
  isVerified: boolean;
}): CrewWorker {
  return {
    id: u.id,
    name: u.name ?? 'Worker',
    photoUrl: u.photoUrl ?? null,
    skills: u.skills ?? [],
    isVerified: Boolean(u.isVerified),
  };
}

export async function listCrew(employerId: string): Promise<CrewWorker[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(crewMembers)
    .where(eq(crewMembers.employerId, employerId))
    .orderBy(desc(crewMembers.createdAt));
  if (rows.length === 0) return [];

  const workerIds = rows.map((r) => r.workerId);
  const workers = await db
    .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, skills: users.skills, isVerified: users.isVerified })
    .from(users)
    .where(inArray(users.id, workerIds));
  const map = new Map(workers.map((u) => [u.id, u]));

  // Preserve crew order (newest first), drop any deleted users.
  return rows
    .map((r) => map.get(r.workerId))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map(toCrewWorker);
}

export async function importContacts(
  employerId: string,
  contacts: ContactInput[],
): Promise<ImportResult> {
  const db = getDb();

  // Normalise + de-dupe contacts by last-10.
  const byTen = new Map<string, ContactInput>();
  for (const c of contacts) {
    const ten = last10(c.phone);
    if (ten && !byTen.has(ten)) byTen.set(ten, { name: c.name ?? '', phone: c.phone });
  }
  if (byTen.size === 0) return { added: [], notOnDoondo: [] };

  // Look up all matching seekers in one query across phone variants.
  const allVariants = [...byTen.keys()].flatMap(variants);
  const foundUsers = await db
    .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, skills: users.skills, isVerified: users.isVerified, phone: users.phone })
    .from(users)
    .where(and(eq(users.role, 'seeker'), inArray(users.phone, allVariants)));

  // Index found users by the last-10 of their stored phone.
  const foundByTen = new Map<string, (typeof foundUsers)[number]>();
  for (const u of foundUsers) {
    const ten = last10(u.phone ?? '');
    if (ten) foundByTen.set(ten, u);
  }

  const added: CrewWorker[] = [];
  const notOnDoondo: ContactInput[] = [];
  for (const [ten, contact] of byTen) {
    const u = foundByTen.get(ten);
    if (u) {
      await db
        .insert(crewMembers)
        .values({ employerId, workerId: u.id, source: 'import' })
        .onConflictDoNothing();
      added.push(toCrewWorker(u));
    } else {
      notOnDoondo.push(contact);
    }
  }

  return { added, notOnDoondo };
}

/**
 * One-tap re-hire: extend a direct, time-boxed offer to a crew member for
 * one of the employer's active jobs. We ensure an Application links the
 * worker to the job (creating a shortlisted one on the employer's behalf
 * if the worker never applied), then route through the standard offer
 * flow — so accepting hires them exactly like any other offer.
 */
export async function rehireCrewMember(
  employerId: string,
  workerId: string,
  jobId: string,
  ttlHours = 24,
) {
  const db = getDb();
  const [job] = await db.select({ employerId: jobs.employerId, status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) {
    throw errors.forbidden();
  }
  if (job.status !== 'active') {
    throw errors.conflict('That job is not active.');
  }

  // Find or create the (worker, job) application. The compound unique index
  // on (seekerId, jobId) makes this safe; a fresh row starts shortlisted so
  // the offer can attach immediately.
  const [app] = await db
    .insert(applications)
    .values({
      seekerId: workerId,
      jobId,
      employerId,
      status: 'shortlisted',
      expressedAsInterest: false,
      appliedAt: new Date(),
      shortlistedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [applications.seekerId, applications.jobId],
      set: { seekerId: workerId },
    })
    .returning();

  return makeOffer({
    employerId,
    applicationId: app!.id,
    ttlHours,
  });
}

export async function removeFromCrew(
  employerId: string,
  workerId: string,
): Promise<void> {
  await getDb().delete(crewMembers).where(and(eq(crewMembers.employerId, employerId), eq(crewMembers.workerId, workerId)));
}
