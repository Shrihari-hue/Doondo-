/**
 * Arrival-likelihood — a heuristic "will they actually show up for this
 * shift?" score, computed at the moment the employer is deciding.
 *
 * This is distinct from a static reliability badge: it blends signals
 * that matter for *this specific shift* —
 *   - travel distance (proximity is the strongest predictor of turning
 *     up for local blue-collar work),
 *   - the shift's time of day (very early / late shifts are missed more),
 *   - the worker's rating history (a fair, earned reliability proxy).
 *
 * It's deliberately transparent: the response carries the contributing
 * `factors` so the employer sees *why* the score is what it is, rather
 * than a black-box number. Nothing here is destiny — it's a nudge to help
 * the employer line up backfill when the odds are poorer, in the same
 * spirit as the night-before confirmation ping.
 *
 * All inputs are already in the DB; no new tracking is introduced.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { ApplicationModel } from '@/modules/applications/application.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { summarizeForUser } from '@/modules/ratings/rating.service';

export type ArrivalBand = 'high' | 'medium' | 'low';

export interface ArrivalFactor {
  /** Short human label, e.g. "Lives 1.2 km away". */
  label: string;
  /** Signed contribution to the score, for the UI to show +/–. */
  effect: number;
}

export interface ArrivalLikelihood {
  score: number; // 0–100
  band: ArrivalBand;
  distanceMeters: number | null;
  factors: ArrivalFactor[];
}

/** Haversine distance in metres between two [lng, lat] points. */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** Hour [0–23] from a "HH:MM" string, or null. */
function hourFromHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^([01]\d|2[0-3]):[0-5]\d$/);
  return m ? Number(s.slice(0, 2)) : null;
}

export async function computeArrivalLikelihood(
  applicationId: string,
  employerId: string,
): Promise<ArrivalLikelihood> {
  const app = await ApplicationModel.findById(applicationId).lean();
  if (!app) throw errors.applicationNotFound();
  if ((app.employerId as unknown as Types.ObjectId).toString() !== employerId) {
    throw errors.forbidden();
  }

  const [job, seeker, rating] = await Promise.all([
    JobModel.findById(app.jobId).select('location schedule').lean(),
    UserModel.findById(app.seekerId).select('location').lean(),
    summarizeForUser(app.seekerId.toString()),
  ]);

  const factors: ArrivalFactor[] = [];
  let score = 70; // baseline

  // ─── Distance ──────────────────────────────────────────────────────────
  const jobCoords = (job as { location?: { geo?: { coordinates?: [number, number] } } } | null)
    ?.location?.geo?.coordinates;
  const seekerCoords = (seeker as { location?: { geo?: { coordinates?: [number, number] } } } | null)
    ?.location?.geo?.coordinates;
  let distanceMeters: number | null = null;
  if (jobCoords && seekerCoords) {
    distanceMeters = haversineMeters(jobCoords, seekerCoords);
    const km = distanceMeters / 1000;
    let effect: number;
    if (km < 2) effect = 20;
    else if (km < 5) effect = 10;
    else if (km < 10) effect = 0;
    else if (km < 20) effect = -10;
    else effect = -18;
    score += effect;
    factors.push({
      label:
        km < 1
          ? `Lives ${distanceMeters} m away`
          : `Lives ${km.toFixed(1)} km away`,
      effect,
    });
  } else {
    score -= 12;
    factors.push({ label: 'Location unknown', effect: -12 });
  }

  // ─── Shift time of day ───────────────────────────────────────────────────
  // Read the shift hour in IST (UTC+5:30), not the server's local zone, so
  // "early/late" is judged against the worker's actual clock.
  const nextShiftHour = app.nextShiftAt
    ? new Date(new Date(app.nextShiftAt).getTime() + (5 * 60 + 30) * 60_000).getUTCHours()
    : null;
  const scheduleHour = hourFromHHMM(
    (job as { schedule?: { startTime?: string | null } } | null)?.schedule?.startTime,
  );
  const shiftHour = nextShiftHour ?? scheduleHour;
  if (shiftHour !== null) {
    if (shiftHour < 6 || shiftHour >= 22) {
      score -= 10;
      factors.push({ label: 'Early/late shift', effect: -10 });
    } else {
      factors.push({ label: 'Daytime shift', effect: 0 });
    }
  }

  // ─── Reliability (ratings) ───────────────────────────────────────────────
  if (rating.count >= 3 && rating.avg >= 4.5) {
    score += 15;
    factors.push({ label: `Strong rating ★${rating.avg}`, effect: 15 });
  } else if (rating.count >= 1 && rating.avg >= 4) {
    score += 8;
    factors.push({ label: `Good rating ★${rating.avg}`, effect: 8 });
  } else if (rating.count >= 3 && rating.avg < 3) {
    score -= 15;
    factors.push({ label: `Low rating ★${rating.avg}`, effect: -15 });
  } else {
    factors.push({ label: 'No rating history yet', effect: 0 });
  }

  score = Math.max(0, Math.min(100, score));
  const band: ArrivalBand = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  return { score, band, distanceMeters, factors };
}
