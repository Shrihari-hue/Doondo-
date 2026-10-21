/**
 * Open shift → nearby employers.
 *
 * When a worker publishes an availability beacon ("I'm free today, ₹700"),
 * ping employers within 15 km who've posted a matching job in the last 90
 * days. Guard rails so this never becomes spam:
 *   - one ping per (worker, employer) per 12 hours
 *   - at most 25 employers per beacon
 *   - employers honour their newApplicant-style toggle via the push gate
 */
import { Schema, model, type Model, Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { sendWorkerAvailablePush } from '@/lib/push';

const RADIUS_M = 15_000;
const MAX_EMPLOYERS = 25;

const pingSchema = new Schema<{ seekerId: Types.ObjectId; employerId: Types.ObjectId; createdAt: Date }>({
  seekerId: { type: Schema.Types.ObjectId, required: true },
  employerId: { type: Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 12 },
});
pingSchema.index({ seekerId: 1, employerId: 1 }, { unique: true });
const OpenShiftPingModel = model('OpenShiftPing', pingSchema) as Model<{ seekerId: Types.ObjectId; employerId: Types.ObjectId; createdAt: Date }>;

interface Beacon {
  seekerId: { toString(): string };
  tradesAvailable?: string[];
  jobTypes?: string[];
  location: { area?: string | null; city?: string | null; geo: { coordinates: [number, number] } };
  dailyRateRupees?: number | null;
  recurringPattern?: unknown;
}

export async function notifyNearbyEmployers(b: Beacon): Promise<number> {
  try {
    const [lng, lat] = b.location.geo.coordinates;
    const trades = (b.tradesAvailable ?? []).map((t) => t.toLowerCase());
    const match: Record<string, unknown> = { createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } };
    if (trades.length || (b.jobTypes ?? []).length) {
      match.$or = [
        ...(trades.length ? [{ skills: { $in: trades } }] : []),
        ...((b.jobTypes ?? []).length ? [{ type: { $in: b.jobTypes } }] : []),
      ];
    }
    const rows = await JobModel.aggregate<{ _id: Types.ObjectId }>([
      { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'd', maxDistance: RADIUS_M, spherical: true, query: match } },
      { $group: { _id: '$employerId' } },
      { $limit: MAX_EMPLOYERS * 2 },
    ]);
    const worker = await UserModel.findById(b.seekerId.toString()).select('name skills').lean();
    const name = (worker as { name?: string } | null)?.name?.split(' ')[0] ?? 'A worker';
    const trade = trades[0] ?? (worker as { skills?: string[] } | null)?.skills?.[0] ?? null;
    let sent = 0;
    for (const r of rows) {
      if (sent >= MAX_EMPLOYERS) break;
      if (r._id.toString() === b.seekerId.toString()) continue;
      try {
        await OpenShiftPingModel.create({ seekerId: new Types.ObjectId(b.seekerId.toString()), employerId: r._id });
      } catch {
        continue; // pinged this employer recently
      }
      void sendWorkerAvailablePush({
        recipientId: r._id.toString(),
        workerFirstName: name,
        trade,
        area: b.location.area ?? b.location.city ?? null,
        dailyRateRupees: b.dailyRateRupees ?? null,
      });
      sent++;
    }
    logger.info({ seekerId: b.seekerId.toString(), sent }, 'open shift: employers notified');
    return sent;
  } catch (err) {
    logger.warn({ err }, 'open shift notify failed');
    return 0;
  }
}
