/**
 * SosAlert — durable record of every SOS the platform routed.
 *
 * Two reasons we persist these rather than just firing pushes:
 *   1. Worker safety is the kind of thing an admin / labor lawyer /
 *      coroner might need to audit later. The receipt has to exist.
 *   2. Aggregating "where do alerts cluster" tells us which sites
 *      need more verified peers or attention.
 *
 * We do NOT store the seeker's coordinates in clear text — the geo
 * Point lives in the doc so we can geo-query within India's borders
 * but the row should never be exposed publicly. All reads go through
 * server-side services; there's no public route on this collection.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface SosAlertGeo {
  type: 'Point';
  /** [lng, lat] */
  coordinates: [number, number];
}

export interface SosAlertFanout {
  /**
   * IDs of Doondo users in the trust circle who got a push. Trust
   * contacts who aren't on Doondo are noted by phone hash only.
   */
  trustContactsPushed: Schema.Types.ObjectId[];
  /** Trust-circle phone hashes that didn't match a Doondo user (for SMS later). */
  trustContactsUnmatched: string[];
  /** Verified peers within range who got the push. */
  peersPushed: Schema.Types.ObjectId[];
}

export interface SosAlert {
  /** Who triggered. */
  triggeredBy: Schema.Types.ObjectId;
  /** ISO point. Empty `coordinates` when the device couldn't get a fix. */
  location?: SosAlertGeo | null;
  /** Optional short note ("I'm at the gate, no one is responding"). */
  note?: string | null;
  fanout: SosAlertFanout;
  /** Set when an admin or peer marks the alert resolved. */
  resolvedAt?: Date | null;
  /** User id who marked it resolved (admin or self). */
  resolvedBy?: Schema.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSosAlert {
  id: string;
  triggeredBy: string;
  location: { lat: number; lng: number } | null;
  note: string | null;
  fanout: {
    trustContactsPushed: number;
    trustContactsUnmatched: number;
    peersPushed: number;
  };
  resolvedAt: string | null;
  createdAt: string;
}

interface SosAlertMethods {
  toPublicJSON(): PublicSosAlert;
}

export type SosAlertDocument = HydratedDocument<SosAlert, SosAlertMethods>;
type SosAlertModelType = Model<SosAlert, Record<string, never>, SosAlertMethods>;

const sosAlertSchema = new Schema<SosAlert, SosAlertModelType, SosAlertMethods>(
  {
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    location: {
      type: new Schema(
        {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: {
            type: [Number],
            validate: {
              validator: (v: number[]) =>
                Array.isArray(v) && v.length === 2 &&
                v[0]! >= -180 && v[0]! <= 180 &&
                v[1]! >= -90 && v[1]! <= 90,
              message: 'coordinates must be [lng, lat] with valid ranges',
            },
          },
        },
        { _id: false },
      ),
      default: null,
    },
    note: { type: String, default: null, trim: true, maxlength: 500 },
    fanout: {
      type: new Schema(
        {
          trustContactsPushed: {
            type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            default: [],
          },
          trustContactsUnmatched: { type: [String], default: [] },
          peersPushed: {
            type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({
        trustContactsPushed: [],
        trustContactsUnmatched: [],
        peersPushed: [],
      }),
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// 2dsphere index for "alerts within X km of point Y" — used by the
// admin dashboard later. Index on the nested geo Point.
sosAlertSchema.index({ 'location.coordinates': '2dsphere' });

// Common queries: "my alerts" + "unresolved alerts".
sosAlertSchema.index({ triggeredBy: 1, createdAt: -1 });
sosAlertSchema.index({ resolvedAt: 1, createdAt: -1 });

sosAlertSchema.method('toPublicJSON', function (this: SosAlertDocument): PublicSosAlert {
  return {
    id: this._id.toString(),
    triggeredBy: this.triggeredBy.toString(),
    location:
      this.location && Array.isArray(this.location.coordinates) && this.location.coordinates.length === 2
        ? {
            lat: this.location.coordinates[1]!,
            lng: this.location.coordinates[0]!,
          }
        : null,
    note: this.note ?? null,
    fanout: {
      trustContactsPushed: this.fanout?.trustContactsPushed?.length ?? 0,
      trustContactsUnmatched: this.fanout?.trustContactsUnmatched?.length ?? 0,
      peersPushed: this.fanout?.peersPushed?.length ?? 0,
    },
    resolvedAt: this.resolvedAt ? this.resolvedAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const SosAlertModel = model<SosAlert, SosAlertModelType>(
  'SosAlert',
  sosAlertSchema,
);
