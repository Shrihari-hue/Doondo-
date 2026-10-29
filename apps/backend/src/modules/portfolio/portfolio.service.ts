/**
 * Workplace portfolio service — read / edit an employer's Look Inside
 * profile. Routes stay thin; every rule lives here.
 */

import { Types } from 'mongoose';
import { AppError } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { JobModel, type PublicJob } from '@/modules/jobs/job.model';
import {
  PortfolioModel,
  MAX_FAQS,
  MAX_PERKS,
  MAX_PHOTOS,
  MAX_PINS_PER_PHOTO,
  MAX_TEAM,
  type PhotoKind,
  type PortfolioDocument,
  type PublicPortfolio,
} from './portfolio.model';
import {
  IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME,
  dataUrlBytes,
  removePortfolioMedia,
  storePortfolioMedia,
} from './portfolioStorage.service';

const oid = (id: string) => new Types.ObjectId(id);

function bad(message: string): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message, status: 400 });
}
function notFound(message: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message, status: 404 });
}

/** Fetch the employer's portfolio, creating an empty one on first touch. */
async function getOrCreate(employerId: string): Promise<PortfolioDocument> {
  const doc = await PortfolioModel.findOneAndUpdate(
    { employerId: oid(employerId) },
    { $setOnInsert: { employerId: oid(employerId) } },
    { upsert: true, new: true },
  );
  return doc!;
}

export interface EmployerSummary {
  id: string;
  name: string;
  companyName: string | null;
  photoUrl: string | null;
  isVerified: boolean;
  businessType: string | null;
  area: string | null;
  city: string | null;
}

async function employerSummary(employerId: string): Promise<EmployerSummary> {
  const u = await UserModel.findOne({ _id: oid(employerId), role: 'employer', isActive: true }).lean();
  if (!u) throw notFound('Employer not found');
  const loc = (u as { employerLocation?: { area?: string | null; city?: string | null } | null }).employerLocation;
  return {
    id: String(u._id),
    name: u.name,
    companyName: u.companyName ?? null,
    photoUrl: u.photoUrl ?? null,
    isVerified: Boolean(u.isVerified),
    businessType: u.businessType ?? null,
    area: loc?.area ?? null,
    city: loc?.city ?? null,
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getMine(employerId: string): Promise<PublicPortfolio> {
  return (await getOrCreate(employerId)).toPublicJSON();
}

/** Public Look Inside payload: employer, portfolio (or null) and open jobs. */
export async function getPublic(employerId: string): Promise<{
  employer: EmployerSummary;
  portfolio: PublicPortfolio | null;
  jobs: PublicJob[];
}> {
  if (!Types.ObjectId.isValid(employerId)) throw bad('Invalid employer id');
  const [employer, doc, jobs] = await Promise.all([
    employerSummary(employerId),
    PortfolioModel.findOne({ employerId: oid(employerId) }),
    JobModel.find({ employerId: oid(employerId), status: 'active' }).sort({ createdAt: -1 }).limit(30),
  ]);
  const openJobIds = new Set(jobs.map((j) => j._id.toString()));
  const portfolio = doc ? doc.toPublicJSON() : null;
  // Pins pointing at closed jobs are shown as plain labels.
  if (portfolio) {
    for (const p of portfolio.photos) {
      for (const pin of p.pins) if (pin.jobId && !openJobIds.has(pin.jobId)) pin.jobId = null;
    }
  }
  return { employer, portfolio, jobs: jobs.map((j) => j.toPublicJSON()) };
}

export interface PortfolioSummary {
  employerId: string;
  photoCount: number;
  coverUrl: string | null;
  hasVideo: boolean;
  teamCount: number;
}

/** Lightweight batch lookup so lists / AR can show "Look inside" affordances. */
export async function getSummaries(employerIds: string[]): Promise<PortfolioSummary[]> {
  const ids = [...new Set(employerIds)].filter((id) => Types.ObjectId.isValid(id)).slice(0, 50);
  if (ids.length === 0) return [];
  const docs = await PortfolioModel.find({ employerId: { $in: ids.map(oid) } })
    .select({ employerId: 1, photos: 1, video: 1, team: 1 })
    .lean();
  return docs.map((d) => {
    const front = d.photos.find((p) => p.kind === 'front') ?? d.photos[0];
    return {
      employerId: String(d.employerId),
      photoCount: d.photos.length,
      coverUrl: front?.url ?? null,
      hasVideo: Boolean(d.video),
      teamCount: d.team.length,
    };
  });
}

// ─── Text / structure edits ─────────────────────────────────────────────────

export interface PortfolioPatch {
  about?: string | null;
  perks?: string[];
  faqs?: Array<{ id?: string; q: string; a: string }>;
  team?: Array<{ id?: string; name: string; role: string; tenure?: string | null }>;
  /** Order + metadata of existing photos. Photos left out are deleted. */
  photos?: Array<{
    id: string;
    kind: PhotoKind;
    caption?: string | null;
    pins?: Array<{ x: number; y: number; jobId?: string | null; label: string }>;
  }>;
}

export async function updateMine(employerId: string, patch: PortfolioPatch): Promise<PublicPortfolio> {
  const doc = await getOrCreate(employerId);

  if (patch.about !== undefined) doc.about = patch.about?.trim() || null;

  if (patch.perks) {
    doc.perks = [...new Set(patch.perks.map((p) => p.trim()).filter(Boolean))].slice(0, MAX_PERKS);
  }

  if (patch.faqs) {
    if (patch.faqs.length > MAX_FAQS) throw bad(`At most ${MAX_FAQS} FAQs.`);
    doc.set(
      'faqs',
      patch.faqs.map((f) => ({
        _id: f.id && Types.ObjectId.isValid(f.id) ? oid(f.id) : new Types.ObjectId(),
        q: f.q,
        a: f.a,
      })),
    );
  }

  if (patch.team) {
    if (patch.team.length > MAX_TEAM) throw bad(`At most ${MAX_TEAM} team members.`);
    const existing = new Map(doc.team.map((m) => [m._id.toString(), m]));
    const keep = new Set<string>();
    const next = patch.team.map((m) => {
      const prev = m.id ? existing.get(m.id) : undefined;
      if (prev) keep.add(prev._id.toString());
      return {
        _id: prev?._id ?? new Types.ObjectId(),
        name: m.name,
        role: m.role,
        tenure: m.tenure?.trim() || null,
        photoUrl: prev?.photoUrl ?? null,
      };
    });
    for (const [id, m] of existing) if (!keep.has(id)) await removePortfolioMedia(m.photoUrl);
    doc.set('team', next);
  }

  if (patch.photos) {
    const existing = new Map(doc.photos.map((p) => [p._id.toString(), p]));
    const pinJobIds = patch.photos.flatMap((p) => (p.pins ?? []).map((pin) => pin.jobId).filter(Boolean)) as string[];
    const ownJobs = pinJobIds.length
      ? new Set(
          (
            await JobModel.find({
              _id: { $in: pinJobIds.filter((id) => Types.ObjectId.isValid(id)).map(oid) },
              employerId: oid(employerId),
            })
              .select({ _id: 1 })
              .lean()
          ).map((j) => String(j._id)),
        )
      : new Set<string>();

    const keep = new Set<string>();
    const next = patch.photos.map((p) => {
      const prev = existing.get(p.id);
      if (!prev) throw bad('Unknown photo id — upload the photo first.');
      keep.add(p.id);
      const pins = (p.pins ?? []).slice(0, MAX_PINS_PER_PHOTO).map((pin) => {
        if (pin.jobId && !ownJobs.has(pin.jobId)) throw bad('A pin points at a job that is not yours.');
        return {
          _id: new Types.ObjectId(),
          x: Math.min(1, Math.max(0, pin.x)),
          y: Math.min(1, Math.max(0, pin.y)),
          jobId: pin.jobId ? oid(pin.jobId) : null,
          label: pin.label,
        };
      });
      return { _id: prev._id, url: prev.url, kind: p.kind, caption: p.caption?.trim() || null, pins };
    });
    for (const [id, p] of existing) if (!keep.has(id)) await removePortfolioMedia(p.url);
    doc.set('photos', next);
  }

  await doc.save();
  return doc.toPublicJSON();
}

// ─── Media ──────────────────────────────────────────────────────────────────

function checkImage(dataUrl: string, mimeType: string) {
  if (!IMAGE_MIME.test(mimeType)) throw bad('Photos must be JPEG, PNG or WebP.');
  if (dataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) throw bad('Photo is too large — please use a smaller one.');
}

export async function addPhoto(
  employerId: string,
  input: { dataUrl: string; mimeType: string; kind: PhotoKind; caption?: string | null },
): Promise<PublicPortfolio> {
  checkImage(input.dataUrl, input.mimeType);
  const doc = await getOrCreate(employerId);
  if (doc.photos.length >= MAX_PHOTOS) throw bad(`At most ${MAX_PHOTOS} photos.`);
  const stored = await storePortfolioMedia({ employerId, dataUrl: input.dataUrl, mimeType: input.mimeType });
  doc.photos.push({
    _id: new Types.ObjectId(),
    url: stored.url,
    kind: input.kind,
    caption: input.caption?.trim() || null,
    pins: [],
  });
  await doc.save();
  return doc.toPublicJSON();
}

export async function removePhoto(employerId: string, photoId: string): Promise<PublicPortfolio> {
  const doc = await getOrCreate(employerId);
  const photo = doc.photos.find((p) => p._id.toString() === photoId);
  if (!photo) throw notFound('Photo not found');
  await removePortfolioMedia(photo.url);
  doc.set(
    'photos',
    doc.photos.filter((p) => p._id.toString() !== photoId),
  );
  await doc.save();
  return doc.toPublicJSON();
}

export async function setTeamPhoto(
  employerId: string,
  memberId: string,
  input: { dataUrl: string; mimeType: string },
): Promise<PublicPortfolio> {
  checkImage(input.dataUrl, input.mimeType);
  const doc = await getOrCreate(employerId);
  const member = doc.team.find((m) => m._id.toString() === memberId);
  if (!member) throw notFound('Team member not found');
  const stored = await storePortfolioMedia({ employerId, dataUrl: input.dataUrl, mimeType: input.mimeType });
  await removePortfolioMedia(member.photoUrl);
  member.photoUrl = stored.url;
  await doc.save();
  return doc.toPublicJSON();
}

export async function setVideo(
  employerId: string,
  input: { dataUrl: string; mimeType: string; durationSeconds: number },
): Promise<PublicPortfolio> {
  if (!VIDEO_MIME.test(input.mimeType)) throw bad('Video must be MP4, MOV or WebM.');
  if (input.durationSeconds > 90) throw bad('Keep the workplace video under 90 seconds.');
  if (dataUrlBytes(input.dataUrl) > MAX_VIDEO_BYTES) throw bad('Video is too large — record a shorter clip.');
  const doc = await getOrCreate(employerId);
  const stored = await storePortfolioMedia({ employerId, dataUrl: input.dataUrl, mimeType: input.mimeType });
  await removePortfolioMedia(doc.video?.url);
  doc.video = { url: stored.url, durationSeconds: input.durationSeconds };
  await doc.save();
  return doc.toPublicJSON();
}

export async function removeVideo(employerId: string): Promise<PublicPortfolio> {
  const doc = await getOrCreate(employerId);
  await removePortfolioMedia(doc.video?.url);
  doc.video = null;
  await doc.save();
  return doc.toPublicJSON();
}
