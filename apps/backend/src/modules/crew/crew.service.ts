/**
 * Crew service — list the employer's saved workers, and import phone
 * contacts by matching numbers to existing Doondo workers.
 *
 * Phone matching is by the last 10 digits (India mobile numbers), which
 * sidesteps the +91 / 0-prefix / spacing variation in how numbers are
 * stored vs. how a phone's address book formats them. For each contact we
 * generate the common stored variants and query users in one shot.
 */

import { Types } from 'mongoose';
import { UserModel } from '@/modules/users/user.model';
import { CrewMemberModel } from './crew.model';

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
  _id: Types.ObjectId;
  name?: string;
  photoUrl?: string | null;
  skills?: string[];
  isVerified?: boolean;
}): CrewWorker {
  return {
    id: u._id.toString(),
    name: u.name ?? 'Worker',
    photoUrl: u.photoUrl ?? null,
    skills: u.skills ?? [],
    isVerified: Boolean(u.isVerified),
  };
}

export async function listCrew(employerId: string): Promise<CrewWorker[]> {
  const rows = await CrewMemberModel.find({ employerId: new Types.ObjectId(employerId) })
    .sort({ createdAt: -1 })
    .lean();
  if (rows.length === 0) return [];
  const workerIds = rows.map((r) => r.workerId as Types.ObjectId);
  const users = await UserModel.find({ _id: { $in: workerIds } })
    .select('name photoUrl skills isVerified')
    .lean();
  const map = new Map(
    users.map((u) => [(u._id as Types.ObjectId).toString(), u]),
  );
  // Preserve crew order (newest first), drop any deleted users.
  return rows
    .map((r) => map.get((r.workerId as Types.ObjectId).toString()))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => toCrewWorker(u as Parameters<typeof toCrewWorker>[0]));
}

export async function importContacts(
  employerId: string,
  contacts: ContactInput[],
): Promise<ImportResult> {
  const meId = new Types.ObjectId(employerId);

  // Normalise + de-dupe contacts by last-10.
  const byTen = new Map<string, ContactInput>();
  for (const c of contacts) {
    const ten = last10(c.phone);
    if (ten && !byTen.has(ten)) byTen.set(ten, { name: c.name ?? '', phone: c.phone });
  }
  if (byTen.size === 0) return { added: [], notOnDoondo: [] };

  // Look up all matching seekers in one query across phone variants.
  const allVariants = [...byTen.keys()].flatMap(variants);
  const users = await UserModel.find({
    role: 'seeker',
    phone: { $in: allVariants },
  })
    .select('name photoUrl skills isVerified phone')
    .lean();

  // Index found users by the last-10 of their stored phone.
  const foundByTen = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    const ten = last10((u as { phone?: string }).phone ?? '');
    if (ten) foundByTen.set(ten, u);
  }

  const added: CrewWorker[] = [];
  const notOnDoondo: ContactInput[] = [];
  for (const [ten, contact] of byTen) {
    const u = foundByTen.get(ten);
    if (u) {
      await CrewMemberModel.updateOne(
        { employerId: meId, workerId: u._id as Types.ObjectId },
        { $setOnInsert: { source: 'import' } },
        { upsert: true },
      );
      added.push(toCrewWorker(u as Parameters<typeof toCrewWorker>[0]));
    } else {
      notOnDoondo.push(contact);
    }
  }

  return { added, notOnDoondo };
}

export async function removeFromCrew(
  employerId: string,
  workerId: string,
): Promise<void> {
  await CrewMemberModel.deleteOne({
    employerId: new Types.ObjectId(employerId),
    workerId: new Types.ObjectId(workerId),
  });
}
