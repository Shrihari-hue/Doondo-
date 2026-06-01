/**
 * Employer response settings — read/write the reachability window and the
 * quiet-hours test the anti-ghost sweep consults.
 *
 * Quiet hours are expressed in IST because that's Doondo's market and the
 * employer set them thinking in their own clock. The server runs in UTC,
 * so the helper converts "now" to IST before comparing. A window is
 * allowed to wrap midnight (start 21 → end 7), handled explicitly.
 */

import { Types } from 'mongoose';
import {
  EmployerResponseSettingsModel,
  type EmployerResponseSettings,
} from './employerResponse.model';

export interface ResponseSettingsView {
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  autoReply: string;
  smsApplicantAlerts: boolean;
}

const DEFAULTS: ResponseSettingsView = {
  quietHoursEnabled: false,
  quietStartHour: 21,
  quietEndHour: 7,
  autoReply: '',
  smsApplicantAlerts: false,
};

/** IST is UTC+5:30, no DST — a fixed offset is correct year-round. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** The hour [0–23] in IST for a given instant. */
export function istHour(now: Date): number {
  const istMs = now.getTime() + IST_OFFSET_MINUTES * 60_000;
  return new Date(istMs).getUTCHours();
}

/**
 * Is `now` inside the employer's quiet window? Handles a window that
 * wraps midnight. When start === end the window is treated as empty (not
 * "all day"), so a misconfigured pair never silences accountability
 * entirely.
 */
export function isWithinQuietHours(
  s: Pick<EmployerResponseSettings, 'quietHoursEnabled' | 'quietStartHour' | 'quietEndHour'>,
  now: Date,
): boolean {
  if (!s.quietHoursEnabled) return false;
  const h = istHour(now);
  const { quietStartHour: start, quietEndHour: end } = s;
  if (start === end) return false;
  return start < end
    ? h >= start && h < end // same-day window
    : h >= start || h < end; // wraps midnight
}

export async function getSettings(employerId: string): Promise<ResponseSettingsView> {
  const doc = await EmployerResponseSettingsModel.findOne({
    employerId: new Types.ObjectId(employerId),
  }).lean();
  if (!doc) return { ...DEFAULTS };
  return {
    quietHoursEnabled: doc.quietHoursEnabled,
    quietStartHour: doc.quietStartHour,
    quietEndHour: doc.quietEndHour,
    autoReply: doc.autoReply ?? '',
    smsApplicantAlerts: doc.smsApplicantAlerts ?? false,
  };
}

/** Cheap check used by the apply hook: has this employer opted into SMS? */
export async function wantsSmsApplicantAlerts(employerId: string): Promise<boolean> {
  const doc = await EmployerResponseSettingsModel.findOne({
    employerId: new Types.ObjectId(employerId),
  })
    .select('smsApplicantAlerts')
    .lean();
  return Boolean(doc?.smsApplicantAlerts);
}

export async function setSettings(
  employerId: string,
  patch: ResponseSettingsView,
): Promise<ResponseSettingsView> {
  await EmployerResponseSettingsModel.findOneAndUpdate(
    { employerId: new Types.ObjectId(employerId) },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return getSettings(employerId);
}

/**
 * Bulk lookup for the ghost sweep: returns the set of employer ids (from
 * the given list) who are currently inside their quiet window and so
 * should be spared flagging this run. Employers with no settings, or
 * quiet hours off, are never in the set.
 */
export async function employersInQuietHours(
  employerIds: string[],
  now: Date,
): Promise<Set<string>> {
  if (employerIds.length === 0) return new Set();
  const docs = await EmployerResponseSettingsModel.find({
    employerId: { $in: employerIds.map((id) => new Types.ObjectId(id)) },
    quietHoursEnabled: true,
  })
    .select('employerId quietHoursEnabled quietStartHour quietEndHour')
    .lean();
  const out = new Set<string>();
  for (const d of docs) {
    if (isWithinQuietHours(d, now)) {
      out.add((d.employerId as Types.ObjectId).toString());
    }
  }
  return out;
}
