/**
 * jobCategory — map a job (title, skills, company) to an icon and a
 * browse category. Used by the AR view, Look Inside and the workplace
 * job sheet so the same job always gets the same icon.
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PublicJob } from '@/api/types';

export type McIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type JobCategory = 'food' | 'retail' | 'healthcare' | 'transport' | 'services' | 'other';

export const JOB_CATEGORIES: ReadonlyArray<JobCategory> = ['food', 'retail', 'healthcare', 'transport', 'services', 'other'];

const RULES: ReadonlyArray<readonly [RegExp, McIcon, JobCategory]> = [
  [/caf[eé]|coffee|barista|tea|juice/, 'coffee', 'food'],
  [/cook|chef|kitchen|restaurant|hotel|waiter|steward|bakery|food|service crew/, 'chef-hat', 'food'],
  [/nurse|care|hospital|clinic|pharma|medical|ward|lab tech/, 'hospital-box', 'healthcare'],
  [/deliver|courier|rider|bike/, 'moped', 'transport'],
  [/driv|chauffeur|cab|taxi|travels/, 'steering', 'transport'],
  [/retail|store|shop|sales|cashier|supermarket|mart|fashion|zudio/, 'storefront-outline', 'retail'],
  [/salon|beaut|barber|hair|spa/, 'content-cut', 'services'],
  [/security|guard|watchman/, 'shield-account', 'services'],
  [/clean|housekeep|maid|janitor|sweep/, 'broom', 'services'],
  [/electric/, 'flash', 'services'],
  [/plumb/, 'pipe-wrench', 'services'],
  [/carpent|furniture|wood/, 'hammer', 'services'],
  [/paint/, 'format-paint', 'services'],
  [/tailor|stitch|sew/, 'needle', 'services'],
  [/construct|mason|labou?r|helper|site/, 'hard-hat', 'other'],
  [/warehouse|pack|loader|godown|logistic/, 'package-variant', 'other'],
  [/office|admin|data entry|computer|reception|telecall/, 'laptop', 'other'],
  [/manager|supervisor|lead/, 'account-tie', 'other'],
  [/teach|tutor/, 'school', 'other'],
];

export function classifyJob(job: Pick<PublicJob, 'title' | 'skills'> & { employer?: PublicJob['employer'] }): {
  icon: McIcon;
  category: JobCategory;
} {
  const text = `${job.title} ${job.skills.join(' ')} ${job.employer?.companyName ?? ''}`.toLowerCase();
  for (const [re, icon, category] of RULES) if (re.test(text)) return { icon, category };
  return { icon: 'briefcase-outline', category: 'other' };
}

/** "₹14,000/month", "₹18,000 – ₹24,000/month", "₹900 fixed". */
export function formatPay(job: Pick<PublicJob, 'pay'>, t: (k: string) => string): string {
  const f = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
  const range = job.pay.amountMax && job.pay.amountMax > job.pay.amount ? `${f(job.pay.amount)} – ${f(job.pay.amountMax)}` : f(job.pay.amount);
  return job.pay.period === 'fixed' ? `${range} ${t('ar.per.fixed')}` : `${range}${t(`ar.per.${job.pay.period}`)}`;
}

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
