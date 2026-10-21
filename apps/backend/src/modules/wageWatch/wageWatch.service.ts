/**
 * Wage Watch — fair-pay transparency for workers.
 *
 * Scope (deliberate): information, not organising. The roadmap flags
 * "Wage Strike Alerts" as politically/legally heavy; this module ships the
 * defensible core — workers can see when a posting pays below (or above)
 * the local going rate, and get a weekly heads-up when the going rate for
 * their trade in their city drops. Collective-action tooling is out of
 * scope pending legal review.
 *
 *   computeWageCheck(job)  — median of comparable postings (same city, same
 *                            pay period, same lead skill or job type; last
 *                            60 days; ≥5 samples) → below / fair / above.
 *   refreshWageCheck(id)   — store it on the job (called after create/update).
 *   runWageWatchSweep()    — weekly: going-rate drop ≥10% vs the prior 4
 *                            weeks → push to workers with that skill in that city.
 */
import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { sendWageAlertPush } from '@/lib/push';

const MIN_SAMPLES = 5;
const BELOW = 0.8;
const ABOVE = 1.2;

export interface WageCheck {
  localMedianPaise: number;
  ratio: number;
  label: 'below' | 'fair' | 'above';
  samples: number;
  computedAt: Date;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : Math.round((a[m - 1]! + a[m]!) / 2);
}

interface JobLike {
  _id: Types.ObjectId;
  type?: string;
  skills?: string[];
  pay?: { amount?: number; period?: string };
  location?: { city?: string | null };
}

async function comparableAmounts(j: JobLike, from: Date, to: Date): Promise<number[]> {
  const city = j.location?.city;
  const period = j.pay?.period;
  if (!city || !period) return [];
  const lead = j.skills?.[0];
  const docs = await JobModel.find({
    _id: { $ne: j._id },
    'pay.period': period,
    'location.city': new RegExp(`^${escapeRegex(city)}$`, 'i'),
    createdAt: { $gte: from, $lt: to },
    ...(lead ? { skills: lead } : { type: j.type }),
  })
    .select('pay.amount')
    .limit(500)
    .lean();
  return docs.map((d) => (d as { pay?: { amount?: number } }).pay?.amount).filter((n): n is number => typeof n === 'number' && n > 0);
}

export async function computeWageCheck(j: JobLike): Promise<WageCheck | null> {
  const amount = j.pay?.amount ?? 0;
  if (!amount || j.pay?.period === 'fixed') return null;
  const now = new Date();
  const amounts = await comparableAmounts(j, new Date(now.getTime() - 60 * 24 * 3600 * 1000), now);
  if (amounts.length < MIN_SAMPLES) return null;
  const med = median(amounts);
  const ratio = Math.round((amount / med) * 100) / 100;
  return {
    localMedianPaise: med,
    ratio,
    label: ratio < BELOW ? 'below' : ratio > ABOVE ? 'above' : 'fair',
    samples: amounts.length,
    computedAt: now,
  };
}

export async function refreshWageCheck(jobId: string): Promise<void> {
  try {
    const j = await JobModel.findById(jobId).select('type skills pay location').lean();
    if (!j) return;
    const wc = await computeWageCheck(j as unknown as JobLike);
    await JobModel.updateOne({ _id: jobId }, { $set: { wageCheck: wc } });
  } catch (err) {
    logger.warn({ err, jobId }, 'wage check refresh failed');
  }
}

/** Weekly: alert workers when the going rate for their trade in their city drops ≥10%. */
export async function runWageWatchSweep(): Promise<{ groups: number; alerted: number }> {
  const now = Date.now();
  const WEEK4 = 28 * 24 * 3600 * 1000;
  const recent = await JobModel.aggregate<{ _id: { city: string; skill: string; period: string }; amounts: number[] }>([
    { $match: { createdAt: { $gte: new Date(now - WEEK4) }, 'pay.amount': { $gt: 0 }, 'pay.period': { $in: ['day', 'hour', 'month', 'week'] } } },
    { $unwind: '$skills' },
    { $group: { _id: { city: { $toLower: '$location.city' }, skill: '$skills', period: '$pay.period' }, amounts: { $push: '$pay.amount' } } },
    { $match: { 'amounts.4': { $exists: true } } },
    { $limit: 300 },
  ]);
  let alerted = 0;
  let groups = 0;
  for (const g of recent) {
    if (!g._id.city || !g._id.skill) continue;
    const prior = await JobModel.find({
      skills: g._id.skill,
      'pay.period': g._id.period,
      'location.city': new RegExp(`^${escapeRegex(g._id.city)}$`, 'i'),
      createdAt: { $gte: new Date(now - 2 * WEEK4), $lt: new Date(now - WEEK4) },
    })
      .select('pay.amount')
      .limit(500)
      .lean();
    const priorAmounts = prior.map((d) => (d as { pay?: { amount?: number } }).pay?.amount ?? 0).filter((n) => n > 0);
    if (priorAmounts.length < MIN_SAMPLES) continue;
    const nowMed = median(g.amounts);
    const prevMed = median(priorAmounts);
    const drop = (prevMed - nowMed) / prevMed;
    if (drop < 0.1) continue;
    groups++;
    const workers = await UserModel.find({
      role: 'seeker',
      skills: g._id.skill,
      'location.city': new RegExp(`^${escapeRegex(g._id.city)}$`, 'i'),
    })
      .select('_id')
      .limit(1000)
      .lean();
    for (const w of workers) {
      void sendWageAlertPush({
        recipientId: String(w._id),
        skill: g._id.skill,
        city: g._id.city,
        period: g._id.period,
        nowPaise: nowMed,
        prevPaise: prevMed,
      });
      alerted++;
    }
  }
  logger.info({ groups, alerted }, 'wage watch sweep complete');
  return { groups, alerted };
}

export interface GoingRate {
  skill: string;
  period: string;
  medianPaise: number;
  p25Paise: number;
  p75Paise: number;
  samples: number;
  /** Change vs the prior 4 weeks, e.g. -0.12 = 12% lower. Null when too few prior samples. */
  trend: number | null;
}

function pct(xs: number[], q: number): number {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * q)))]!;
}

/** Going rates for a worker's skills in their city (last 4 weeks vs the 4 before). */
export async function goingRatesForUser(userId: string): Promise<{ city: string | null; rates: GoingRate[] }> {
  const u = await UserModel.findById(userId).select('skills location').lean();
  const city = (u as { location?: { city?: string | null } } | null)?.location?.city ?? null;
  const skills = ((u as { skills?: string[] } | null)?.skills ?? []).slice(0, 5);
  if (!city || skills.length === 0) return { city, rates: [] };
  const now = Date.now();
  const WEEK4 = 28 * 24 * 3600 * 1000;
  const cityRe = new RegExp(`^${escapeRegex(city)}$`, 'i');
  const rates: GoingRate[] = [];
  for (const skill of skills) {
    const docs = await JobModel.find({ skills: skill, 'location.city': cityRe, createdAt: { $gte: new Date(now - 2 * WEEK4) }, 'pay.amount': { $gt: 0 } })
      .select('pay createdAt')
      .limit(800)
      .lean();
    const byPeriod = new Map<string, { recent: number[]; prior: number[] }>();
    for (const d of docs) {
      const pay = (d as { pay?: { amount?: number; period?: string } }).pay;
      if (!pay?.amount || !pay.period || pay.period === 'fixed') continue;
      const bucket = byPeriod.get(pay.period) ?? { recent: [], prior: [] };
      ((d as { createdAt: Date }).createdAt.getTime() >= now - WEEK4 ? bucket.recent : bucket.prior).push(pay.amount);
      byPeriod.set(pay.period, bucket);
    }
    // The period with the most recent postings is the trade's "normal" one.
    const best = [...byPeriod.entries()].sort((a, b) => b[1].recent.length - a[1].recent.length)[0];
    if (!best || best[1].recent.length < 3) continue;
    const [period, { recent, prior }] = best;
    const med = median(recent);
    rates.push({
      skill,
      period,
      medianPaise: med,
      p25Paise: pct(recent, 0.25),
      p75Paise: pct(recent, 0.75),
      samples: recent.length,
      trend: prior.length >= MIN_SAMPLES ? Math.round(((med - median(prior)) / median(prior)) * 100) / 100 : null,
    });
  }
  return { city, rates };
}
