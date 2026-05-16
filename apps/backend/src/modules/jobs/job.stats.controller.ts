/**
 * Pay statistics endpoint — feeds the "Typical pay for X in Y" line that
 * appears under the pay row on JobDetail.
 *
 * Cuts the eternal negotiation friction blue-collar workers face when
 * an employer lowballs them: instead of a worker asking around at the
 * chowk, the app tells them upfront *"₹450–600/day is the going rate
 * for Helpers in Bengaluru this month."*
 *
 * Strategy:
 *   - Group active jobs by (type, city, pay.period). Compare like with
 *     like — ₹600/day and ₹15000/month don't share an axis.
 *   - Compute p25 / p50 / p75 on `pay.amount` (paise). Done in JS after
 *     a single `.lean()` projection so we don't lean on Mongo's
 *     `$percentile` (5.0+ only). Sample sizes are small enough that an
 *     in-process sort is cheap.
 *   - Below 5 samples we return null — too few to be a useful signal.
 *   - The window is the last 60 days so a single ancient outlier post
 *     doesn't skew the median forever.
 */

import type { Request, Response, NextFunction } from 'express';
import { JobModel, JOB_TYPES, PAY_PERIODS, type JobType, type PayPeriod } from './job.model';
import { AppError } from '@/lib/errors';

const MIN_SAMPLE_SIZE = 5;
const WINDOW_DAYS = 60;

export interface PayStatsResult {
  /** Number of jobs that contributed to the stats. Hidden line if < 5. */
  sampleSize: number;
  /** Lower quartile (25th percentile) in paise. */
  p25: number | null;
  /** Median in paise. */
  p50: number | null;
  /** Upper quartile (75th percentile) in paise. */
  p75: number | null;
  /** Echoed back so the client can render the right unit suffix. */
  period: PayPeriod;
  /** Echoed back so the client can render "for {type} in {city}". */
  type: JobType;
  city: string;
  currency: string;
}

export async function getPayStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type = String(req.query.type ?? '').toLowerCase();
    const city = String(req.query.city ?? '').trim();
    const period = String(req.query.period ?? '').toLowerCase();

    if (!type || !(JOB_TYPES as readonly string[]).includes(type)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid job type',
        status: 400,
      });
    }
    if (!period || !(PAY_PERIODS as readonly string[]).includes(period)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid pay period',
        status: 400,
      });
    }
    if (!city) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'City is required',
        status: 400,
      });
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const docs = await JobModel.find({
      status: 'active',
      type: type as JobType,
      'pay.period': period as PayPeriod,
      // Case-insensitive city match — employers may post with slight
      // capitalisation differences ("Bengaluru" vs "bengaluru").
      'location.city': new RegExp(`^${escapeRegex(city)}$`, 'i'),
      createdAt: { $gte: since },
    })
      .select('pay.amount pay.currency')
      .lean();

    const sampleSize = docs.length;

    if (sampleSize < MIN_SAMPLE_SIZE) {
      const result: PayStatsResult = {
        sampleSize,
        p25: null,
        p50: null,
        p75: null,
        period: period as PayPeriod,
        type: type as JobType,
        city,
        currency: docs[0]?.pay.currency ?? 'INR',
      };
      res.status(200).json({ ok: true, data: result });
      return;
    }

    const amounts = docs
      .map((d) => d.pay.amount)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);

    const result: PayStatsResult = {
      sampleSize,
      p25: percentile(amounts, 25),
      p50: percentile(amounts, 50),
      p75: percentile(amounts, 75),
      period: period as PayPeriod,
      type: type as JobType,
      city,
      currency: docs[0]?.pay.currency ?? 'INR',
    };

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * Nearest-rank percentile on a sorted ascending array. Good enough for
 * the small samples we're working with — no need for linear
 * interpolation that would require a full statistical primitive.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
