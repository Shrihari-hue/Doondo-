/**
 * Shared job-card formatters — pay, distance, type, trade glyph.
 *
 * These lived privately inside `home/DenseJobFeed.tsx` until the Short
 * Term / Long Term feeds needed exactly the same money and distance
 * strings. Extracted rather than copied: two implementations of "how
 * Doondo writes ₹18,000/month" would drift, and the seeker would see the
 * same job priced two different ways on two different screens.
 */

import { TRADES, tradeEmoji } from '@/lib/trades';
import type { PublicJob } from '@/api/types';

/** Local alias for the translate function, matching the feed components. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** "₹500 one-time" / "₹18,000/month" — the full single-line pay string. */
export function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range =
    max && max > min
      ? `${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}`
      : min.toLocaleString('en-IN');
  const suffix =
    pay.period === 'hour'
      ? ' ' + t('common.pay_period.suffix_hour')
      : pay.period === 'day'
        ? ' ' + t('common.pay_period.suffix_day')
        : pay.period === 'week'
          ? ' ' + t('common.pay_period.suffix_week')
          : pay.period === 'month'
            ? ' ' + t('common.pay_period.suffix_month')
            : t('common.pay_period.suffix_fixed');
  return `₹${range}${suffix}`;
}

/**
 * Just the money — "₹500", "₹16,000–18,000". 'en-IN' for the lakh/crore
 * grouping every Indian user expects (1,00,000), regardless of UI
 * language: the digits and ₹ are universal.
 */
export function formatPayPrimary(pay: PublicJob['pay']): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  return max && max > min
    ? `₹${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}`
    : `₹${min.toLocaleString('en-IN')}`;
}

/** The "/month", "per day", "one-time" tail that follows the amount. */
export function formatPaySuffix(pay: PublicJob['pay'], t: TFn): string {
  switch (pay.period) {
    case 'hour':
      return t('common.pay_period.per_hour');
    case 'day':
      return t('common.pay_period.per_day');
    case 'week':
      return t('common.pay_period.per_week');
    case 'month':
      return t('common.pay_period.per_month');
    case 'fixed':
      return t('common.pay_period.one_time');
  }
}

/** Localised job-type label ("Full Time", "Shift", …). */
export function formatType(type: PublicJob['type'], t: TFn): string {
  return t(`common.job_type.${type}`);
}

/** "800 m" under a kilometre, "1.2 km" above it. */
export function formatDistance(meters: number, t: TFn): string {
  if (meters < 1000) return t('common.units.meters_short', { n: meters });
  return t('common.units.kilometers_short', { n: (meters / 1000).toFixed(1) });
}

/**
 * A recognisable glyph for a posting — tried against the job's tagged
 * trade slugs first, then its title text, before falling back to 💼.
 * Low-literacy workers scan the emoji before they read the title.
 */
export function pickJobIcon(job: PublicJob): string {
  for (const skill of job.skills ?? []) {
    const e = tradeEmoji(skill);
    if (e) return e;
  }
  const title = job.title.toLowerCase();
  for (const trade of TRADES) {
    if (title.includes(trade.slug.replace(/_/g, ' '))) return trade.emoji;
    if (trade.aliases.some((a) => title.includes(a))) return trade.emoji;
  }
  return '💼';
}
