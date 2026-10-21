/**
 * Doondo Diaspora (v1) — families abroad hiring help for relatives in India.
 *
 * What v1 does:
 *   - the employer marks their account as "hiring from abroad", picks their
 *     country/timezone, and names a local contact in India (parent, sibling);
 *   - when a hired worker checks in or out, the local contact gets an SMS
 *     (they may not have Doondo), so the family abroad isn't the only one
 *     who knows whether the caregiver/driver showed up.
 *
 * Out of scope (roadmap #42): foreign-card billing and payer KYC. Payment
 * still runs through the existing UPI / cash flows, typically by the local
 * contact.
 */
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendTransactionalSms } from '@/lib/transactionalSms';
import { UserModel } from '@/modules/users/user.model';

export interface DiasporaSettings {
  enabled: boolean;
  country: string | null;
  timezone: string | null;
  localContact: { name: string | null; phone: string | null; relation: string | null } | null;
}

export async function getSettings(userId: string): Promise<DiasporaSettings> {
  const u = await UserModel.findById(userId).select('diaspora').lean();
  const d = (u as { diaspora?: Partial<DiasporaSettings> } | null)?.diaspora ?? {};
  return {
    enabled: Boolean(d.enabled),
    country: d.country ?? null,
    timezone: d.timezone ?? null,
    localContact: d.localContact
      ? { name: d.localContact.name ?? null, phone: d.localContact.phone ?? null, relation: d.localContact.relation ?? null }
      : null,
  };
}

export async function saveSettings(userId: string, s: Partial<DiasporaSettings>): Promise<DiasporaSettings> {
  if (s.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: s.timezone });
    } catch {
      throw errors.validation(null, 'Unknown timezone.');
    }
  }
  const $set: Record<string, unknown> = {};
  if (typeof s.enabled === 'boolean') $set['diaspora.enabled'] = s.enabled;
  if (s.country !== undefined) $set['diaspora.country'] = s.country;
  if (s.timezone !== undefined) $set['diaspora.timezone'] = s.timezone;
  if (s.localContact !== undefined) $set['diaspora.localContact'] = s.localContact;
  await UserModel.updateOne({ _id: userId }, { $set });
  return getSettings(userId);
}

/** Called from shift check-in/out. Best-effort, never throws. */
export async function notifyLocalContact(input: {
  employerId: string;
  workerName: string;
  jobTitle: string;
  kind: 'check_in' | 'check_out';
  at: Date;
}): Promise<void> {
  try {
    const s = await getSettings(input.employerId);
    if (!s.enabled || !s.localContact?.phone) return;
    const time = input.at.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
    const verb = input.kind === 'check_in' ? 'arrived' : 'left';
    await sendTransactionalSms({
      phone: s.localContact.phone,
      message: `Doondo: ${input.workerName} ${verb} for "${input.jobTitle}" at ${time}.`.slice(0, 160),
    });
  } catch (err) {
    logger.warn({ err }, 'diaspora local-contact SMS failed');
  }
}
