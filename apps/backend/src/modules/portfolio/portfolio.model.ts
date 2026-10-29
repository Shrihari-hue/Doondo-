/**
 * WorkplacePortfolio — an employer's "Look Inside" profile.
 *
 * One document per employer (unique `employerId`). The business owner
 * uploads photos of the place (front, work area, seating, team, kitchen…),
 * an optional short workplace video, the team, perks and FAQs. Seekers
 * see it as a visual tour from the AR view, job detail and the
 * workplace job sheet.
 *
 * Photos can carry "role pins": a point on the photo (x/y as 0..1 of the
 * image) linked to one of the employer's jobs, so a seeker sees *where*
 * a Barista or Shift Manager actually works and can tap straight into
 * that vacancy.
 *
 * Only URLs are stored — bytes live with the portfolio storage provider
 * (local disk in dev, the configured uploader/CDN in production).
 */

import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const PHOTO_KINDS = ['front', 'work_area', 'seating', 'team', 'kitchen', 'other'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const MAX_PHOTOS = 12;
export const MAX_PINS_PER_PHOTO = 6;
export const MAX_TEAM = 12;
export const MAX_FAQS = 10;
export const MAX_PERKS = 10;

export interface RolePin {
  _id: Types.ObjectId;
  /** Horizontal position, 0 (left) … 1 (right) of the photo. */
  x: number;
  /** Vertical position, 0 (top) … 1 (bottom) of the photo. */
  y: number;
  /** The vacancy this pin points at, or null for a plain label. */
  jobId: Types.ObjectId | null;
  /** Role label shown on the pin, e.g. "Barista". */
  label: string;
}

export interface PortfolioPhoto {
  _id: Types.ObjectId;
  url: string;
  kind: PhotoKind;
  caption: string | null;
  pins: RolePin[];
}

export interface TeamMember {
  _id: Types.ObjectId;
  name: string;
  role: string;
  photoUrl: string | null;
  /** Free text like "3 years here". */
  tenure: string | null;
}

export interface Faq {
  _id: Types.ObjectId;
  q: string;
  a: string;
}

export interface WorkplaceVideo {
  url: string;
  durationSeconds: number;
}

export interface WorkplacePortfolio {
  employerId: Types.ObjectId;
  about: string | null;
  perks: string[];
  photos: PortfolioPhoto[];
  video: WorkplaceVideo | null;
  team: TeamMember[];
  faqs: Faq[];
  createdAt: Date;
  updatedAt: Date;
}

/** Shape sent to clients. */
export interface PublicPortfolio {
  employerId: string;
  about: string | null;
  perks: string[];
  photos: Array<{
    id: string;
    url: string;
    kind: PhotoKind;
    caption: string | null;
    pins: Array<{ id: string; x: number; y: number; jobId: string | null; label: string }>;
  }>;
  video: WorkplaceVideo | null;
  team: Array<{ id: string; name: string; role: string; photoUrl: string | null; tenure: string | null }>;
  faqs: Array<{ id: string; q: string; a: string }>;
  updatedAt: string;
}

interface PortfolioMethods {
  toPublicJSON(): PublicPortfolio;
}

export type PortfolioDocument = HydratedDocument<WorkplacePortfolio, PortfolioMethods>;
type PortfolioModelType = Model<WorkplacePortfolio, Record<string, never>, PortfolioMethods>;

const pinSchema = new Schema<RolePin>({
  x: { type: Number, required: true, min: 0, max: 1 },
  y: { type: Number, required: true, min: 0, max: 1 },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
  label: { type: String, required: true, trim: true, maxlength: 60 },
});

const photoSchema = new Schema<PortfolioPhoto>({
  url: { type: String, required: true, maxlength: 2000 },
  kind: { type: String, enum: PHOTO_KINDS, default: 'other' },
  caption: { type: String, default: null, trim: true, maxlength: 80 },
  pins: { type: [pinSchema], default: [] },
});

const teamSchema = new Schema<TeamMember>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  role: { type: String, required: true, trim: true, maxlength: 60 },
  photoUrl: { type: String, default: null, maxlength: 2000 },
  tenure: { type: String, default: null, trim: true, maxlength: 40 },
});

const faqSchema = new Schema<Faq>({
  q: { type: String, required: true, trim: true, maxlength: 160 },
  a: { type: String, required: true, trim: true, maxlength: 600 },
});

const portfolioSchema = new Schema<WorkplacePortfolio, PortfolioModelType, PortfolioMethods>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    about: { type: String, default: null, trim: true, maxlength: 600 },
    perks: { type: [String], default: [] },
    photos: { type: [photoSchema], default: [] },
    video: {
      type: new Schema<WorkplaceVideo>(
        {
          url: { type: String, required: true, maxlength: 2000 },
          durationSeconds: { type: Number, required: true, min: 0, max: 120 },
        },
        { _id: false },
      ),
      default: null,
    },
    team: { type: [teamSchema], default: [] },
    faqs: { type: [faqSchema], default: [] },
  },
  { timestamps: true },
);

portfolioSchema.methods.toPublicJSON = function toPublicJSON(this: PortfolioDocument): PublicPortfolio {
  return {
    employerId: this.employerId.toString(),
    about: this.about ?? null,
    perks: [...(this.perks ?? [])],
    photos: (this.photos ?? []).map((p) => ({
      id: p._id.toString(),
      url: p.url,
      kind: p.kind,
      caption: p.caption ?? null,
      pins: (p.pins ?? []).map((pin) => ({
        id: pin._id.toString(),
        x: pin.x,
        y: pin.y,
        jobId: pin.jobId ? pin.jobId.toString() : null,
        label: pin.label,
      })),
    })),
    video: this.video ? { url: this.video.url, durationSeconds: this.video.durationSeconds } : null,
    team: (this.team ?? []).map((m) => ({
      id: m._id.toString(),
      name: m.name,
      role: m.role,
      photoUrl: m.photoUrl ?? null,
      tenure: m.tenure ?? null,
    })),
    faqs: (this.faqs ?? []).map((f) => ({ id: f._id.toString(), q: f.q, a: f.a })),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const PortfolioModel = model<WorkplacePortfolio, PortfolioModelType>(
  'WorkplacePortfolio',
  portfolioSchema,
);
