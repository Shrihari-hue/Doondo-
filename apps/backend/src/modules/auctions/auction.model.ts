/**
 * Live Job Auction — an urgent gig where the employer names a ceiling and
 * nearby workers bid (amount + ETA) for a short window. The employer awards
 * one bid, which becomes a normal time-boxed offer on the job.
 *
 * Fragility rules baked in (roadmap #41 concern: "worker on the way,
 * employer cancels, who pays?"):
 *   - once awarded, an employer cancel is recorded as `cancelledAfterAward`
 *     and counts against them (shown to workers), and the winner is told;
 *   - a worker can withdraw a bid only before award.
 */
import { Schema, model, type Model, Types } from 'mongoose';

export const AUCTION_STATUSES = ['live', 'awarded', 'closed', 'cancelled'] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export interface Auction {
  jobId: Types.ObjectId;
  employerId: Types.ObjectId;
  maxPaise: number;
  startsAt: Date;
  endsAt: Date;
  status: AuctionStatus;
  winningBidId: Types.ObjectId | null;
  cancelledAfterAward: boolean;
  geo: { type: 'Point'; coordinates: [number, number] };
  createdAt: Date;
  updatedAt: Date;
}

const auctionSchema = new Schema<Auction, Model<Auction>>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    maxPaise: { type: Number, required: true, min: 100 },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: AUCTION_STATUSES, default: 'live', index: true },
    winningBidId: { type: Schema.Types.ObjectId, default: null },
    cancelledAfterAward: { type: Boolean, default: false },
    geo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  { timestamps: true },
);
auctionSchema.index({ geo: '2dsphere' });

export const AuctionModel = model<Auction, Model<Auction>>('Auction', auctionSchema);

export interface AuctionBid {
  auctionId: Types.ObjectId;
  seekerId: Types.ObjectId;
  amountPaise: number;
  etaMinutes: number;
  status: 'active' | 'withdrawn' | 'won' | 'lost';
  createdAt: Date;
}

const bidSchema = new Schema<AuctionBid, Model<AuctionBid>>(
  {
    auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 100 },
    etaMinutes: { type: Number, required: true, min: 0, max: 240 },
    status: { type: String, enum: ['active', 'withdrawn', 'won', 'lost'], default: 'active' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
bidSchema.index({ auctionId: 1, seekerId: 1 }, { unique: true });

export const AuctionBidModel = model<AuctionBid, Model<AuctionBid>>('AuctionBid', bidSchema);
