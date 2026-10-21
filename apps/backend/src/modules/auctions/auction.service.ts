/**
 * Live Job Auction service.
 */
import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendAuctionPush } from '@/lib/push';
import { ApplicationModel } from '@/modules/applications/application.model';
import { makeOffer } from '@/modules/applications/application.service';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { AuctionBidModel, AuctionModel, type AuctionStatus } from './auction.model';

const NOTIFY_RADIUS_M = 10_000;
const MAX_NOTIFY = 200;

export interface PublicAuction {
  id: string;
  jobId: string;
  jobTitle: string;
  employerName: string;
  /** Employer cancelled after awarding in past auctions — a trust signal for workers. */
  employerLateCancels: number;
  maxPaise: number;
  endsAt: string;
  status: AuctionStatus;
  bidCount: number;
  lowestBidPaise: number | null;
  myBid: { amountPaise: number; etaMinutes: number; status: string } | null;
  distanceMeters?: number;
}

export interface PublicBid {
  id: string;
  seekerId: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
  amountPaise: number;
  etaMinutes: number;
  status: string;
}

async function summarize(a: Record<string, any>, viewerId?: string): Promise<PublicAuction> {
  const [job, employer, bids, lateCancels] = await Promise.all([
    JobModel.findById(a.jobId).select('title').lean(),
    UserModel.findById(a.employerId).select('name companyName').lean(),
    AuctionBidModel.find({ auctionId: a._id, status: { $in: ['active', 'won', 'lost'] } }).select('seekerId amountPaise etaMinutes status').lean(),
    AuctionModel.countDocuments({ employerId: a.employerId, cancelledAfterAward: true }),
  ]);
  const mine = viewerId ? bids.find((b) => String(b.seekerId) === viewerId) : undefined;
  return {
    id: String(a._id),
    jobId: String(a.jobId),
    jobTitle: (job as { title?: string } | null)?.title ?? 'Job',
    employerName: (employer as { companyName?: string | null; name?: string } | null)?.companyName || (employer as { name?: string } | null)?.name || 'Employer',
    employerLateCancels: lateCancels,
    maxPaise: a.maxPaise,
    endsAt: new Date(a.endsAt).toISOString(),
    status: a.status,
    bidCount: bids.length,
    lowestBidPaise: bids.length ? Math.min(...bids.map((b) => b.amountPaise)) : null,
    myBid: mine ? { amountPaise: mine.amountPaise, etaMinutes: mine.etaMinutes, status: mine.status } : null,
    ...(typeof a.distanceMeters === 'number' ? { distanceMeters: Math.round(a.distanceMeters) } : {}),
  };
}

/** Close auctions whose window passed with no award. Cheap; run lazily on reads + by cron. */
export async function closeExpired(): Promise<number> {
  const r = await AuctionModel.updateMany({ status: 'live', endsAt: { $lte: new Date() } }, { $set: { status: 'closed' } });
  return r.modifiedCount;
}

export async function startAuction(employerId: string, input: { jobId: string; maxPaise: number; durationMinutes: number }): Promise<PublicAuction> {
  if (!Types.ObjectId.isValid(input.jobId)) throw errors.jobNotFound();
  const job = await JobModel.findById(input.jobId).select('employerId status location title skills').lean();
  if (!job) throw errors.jobNotFound();
  if (String(job.employerId) !== employerId) throw errors.forbidden();
  if ((job as { status?: string }).status !== 'active') throw errors.conflict('That job is not active.');
  if (await AuctionModel.exists({ jobId: job._id, status: 'live' })) throw errors.conflict('An auction is already running for this job.');
  const coords = (job as { location?: { geo?: { coordinates?: [number, number] } } }).location?.geo?.coordinates;
  if (!coords) throw errors.conflict('The job needs a location for an auction.');
  const a = await AuctionModel.create({
    jobId: job._id,
    employerId: new Types.ObjectId(employerId),
    maxPaise: Math.round(input.maxPaise),
    endsAt: new Date(Date.now() + input.durationMinutes * 60_000),
    geo: { type: 'Point', coordinates: coords },
  });
  // Notify nearby workers with a matching skill (or anyone nearby if the job lists none).
  void (async () => {
    try {
      const skills = ((job as { skills?: string[] }).skills ?? []).map((s) => s.toLowerCase());
      const users = await UserModel.find({
        role: 'seeker',
        'location.geo': { $near: { $geometry: { type: 'Point', coordinates: coords }, $maxDistance: NOTIFY_RADIUS_M } },
        ...(skills.length ? { skills: { $in: skills } } : {}),
      })
        .select('_id')
        .limit(MAX_NOTIFY)
        .lean();
      const rupees = Math.round(input.maxPaise / 100);
      for (const u of users) {
        void sendAuctionPush({
          recipientId: String(u._id),
          auctionId: a.id,
          title: 'Urgent job — bid now',
          body: `${(job as { title?: string }).title ?? 'A job'} · up to ₹${rupees} · ${input.durationMinutes} min to bid`,
          type: 'auction:started',
        });
      }
    } catch (err) {
      logger.warn({ err }, 'auction fan-out failed');
    }
  })();
  return summarize(a.toObject());
}

export async function listNearby(seekerId: string, lat: number, lng: number): Promise<PublicAuction[]> {
  await closeExpired();
  const rows = await AuctionModel.aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distanceMeters', maxDistance: NOTIFY_RADIUS_M * 2, spherical: true, query: { status: 'live', endsAt: { $gt: new Date() } } } },
    { $limit: 20 },
  ]);
  return Promise.all(rows.map((r) => summarize(r, seekerId)));
}

export async function placeBid(seekerId: string, auctionId: string, input: { amountPaise: number; etaMinutes: number }): Promise<PublicAuction> {
  if (!Types.ObjectId.isValid(auctionId)) throw errors.notFound('Auction not found.');
  const a = await AuctionModel.findById(auctionId).lean();
  if (!a || a.status !== 'live' || a.endsAt.getTime() <= Date.now()) throw errors.conflict('This auction has ended.');
  if (String(a.employerId) === seekerId) throw errors.forbidden();
  if (input.amountPaise > a.maxPaise) throw errors.validation(null, `Bid can't be more than ₹${Math.round(a.maxPaise / 100)}.`);
  await AuctionBidModel.findOneAndUpdate(
    { auctionId: a._id, seekerId: new Types.ObjectId(seekerId) },
    { $set: { amountPaise: Math.round(input.amountPaise), etaMinutes: Math.round(input.etaMinutes), status: 'active' } },
    { upsert: true, new: true },
  );
  void sendAuctionPush({
    recipientId: String(a.employerId),
    auctionId,
    title: 'New bid',
    body: `₹${Math.round(input.amountPaise / 100)} · can be there in ${input.etaMinutes} min`,
    type: 'auction:bid',
  }).catch(() => undefined);
  return summarize(a, seekerId);
}

export async function withdrawBid(seekerId: string, auctionId: string): Promise<void> {
  const a = await AuctionModel.findById(auctionId).select('status').lean();
  if (!a) throw errors.notFound('Auction not found.');
  if (a.status !== 'live') throw errors.conflict('You can only withdraw while the auction is live.');
  await AuctionBidModel.updateOne({ auctionId: a._id, seekerId: new Types.ObjectId(seekerId) }, { $set: { status: 'withdrawn' } });
}

export async function getForEmployer(employerId: string, auctionId: string): Promise<{ auction: PublicAuction; bids: PublicBid[] }> {
  await closeExpired();
  if (!Types.ObjectId.isValid(auctionId)) throw errors.notFound('Auction not found.');
  const a = await AuctionModel.findById(auctionId).lean();
  if (!a || String(a.employerId) !== employerId) throw errors.notFound('Auction not found.');
  const bids = await AuctionBidModel.find({ auctionId: a._id, status: { $ne: 'withdrawn' } }).sort({ amountPaise: 1, etaMinutes: 1 }).lean();
  const users = await UserModel.find({ _id: { $in: bids.map((b) => b.seekerId) } }).select('name photoUrl isVerified').lean();
  const u = new Map(users.map((x) => [String(x._id), x as { name?: string; photoUrl?: string | null; isVerified?: boolean }]));
  return {
    auction: await summarize(a),
    bids: bids.map((b) => ({
      id: String(b._id),
      seekerId: String(b.seekerId),
      name: u.get(String(b.seekerId))?.name ?? 'Worker',
      photoUrl: u.get(String(b.seekerId))?.photoUrl ?? null,
      isVerified: Boolean(u.get(String(b.seekerId))?.isVerified),
      amountPaise: b.amountPaise,
      etaMinutes: b.etaMinutes,
      status: b.status,
    })),
  };
}

export async function listMineForEmployer(employerId: string): Promise<PublicAuction[]> {
  await closeExpired();
  const rows = await AuctionModel.find({ employerId: new Types.ObjectId(employerId) }).sort({ createdAt: -1 }).limit(20).lean();
  return Promise.all(rows.map((r) => summarize(r)));
}

/** Award a bid → normal time-boxed offer at the bid amount (30-min TTL). */
export async function award(employerId: string, auctionId: string, bidId: string): Promise<{ applicationId: string }> {
  if (!Types.ObjectId.isValid(auctionId) || !Types.ObjectId.isValid(bidId)) throw errors.notFound('Not found.');
  const a = await AuctionModel.findOneAndUpdate(
    { _id: auctionId, employerId: new Types.ObjectId(employerId), status: { $in: ['live', 'closed'] }, winningBidId: null },
    { $set: { status: 'awarded', winningBidId: new Types.ObjectId(bidId) } },
    { new: true },
  );
  if (!a) throw errors.conflict('This auction can no longer be awarded.');
  const bid = await AuctionBidModel.findOne({ _id: bidId, auctionId: a._id, status: 'active' });
  if (!bid) {
    await AuctionModel.updateOne({ _id: a._id }, { $set: { status: 'live', winningBidId: null } });
    throw errors.conflict('That bid was withdrawn.');
  }
  const app = await ApplicationModel.findOneAndUpdate(
    { seekerId: bid.seekerId, jobId: a.jobId },
    { $setOnInsert: { employerId: a.employerId, status: 'shortlisted', expressedAsInterest: false, appliedAt: new Date(), shortlistedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await makeOffer({ employerId, applicationId: String(app._id), ttlHours: 1, wageAmount: bid.amountPaise });
  await AuctionBidModel.updateOne({ _id: bid._id }, { $set: { status: 'won' } });
  await AuctionBidModel.updateMany({ auctionId: a._id, _id: { $ne: bid._id }, status: 'active' }, { $set: { status: 'lost' } });
  void sendAuctionPush({
    recipientId: String(bid.seekerId),
    auctionId,
    title: 'You won the job! 🎉',
    body: `Your bid of ₹${Math.round(bid.amountPaise / 100)} was picked. Accept the offer to confirm.`,
    type: 'auction:won',
  }).catch(() => undefined);
  return { applicationId: String(app._id) };
}

export async function cancel(employerId: string, auctionId: string): Promise<void> {
  const a = await AuctionModel.findOne({ _id: auctionId, employerId: new Types.ObjectId(employerId) });
  if (!a) throw errors.notFound('Auction not found.');
  if (a.status === 'cancelled') return;
  const afterAward = a.status === 'awarded';
  a.status = 'cancelled';
  a.cancelledAfterAward = afterAward;
  await a.save();
  if (afterAward && a.winningBidId) {
    const bid = await AuctionBidModel.findById(a.winningBidId).lean();
    if (bid) {
      void sendAuctionPush({
        recipientId: String(bid.seekerId),
        auctionId,
        title: 'Employer cancelled',
        body: "Sorry — the employer cancelled after picking you. This is recorded on their profile. If you were already on the way, raise it from My Applications.",
        type: 'auction:cancelled',
      }).catch(() => undefined);
    }
  }
}
