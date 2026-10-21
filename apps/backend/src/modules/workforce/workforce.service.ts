/**
 * Workforce service — real per-worker numbers for the employer's
 * "Workers" tab, Worker detail, Attendance, Activity, Salary and Payroll
 * screens. Everything is derived from data we already record:
 *
 *   attendance  ← ShiftCheckIn (check_in rows) + WorkerLeave
 *   trust score ← Doondo Score (users/doondoScore.service)
 *   pay history ← PaymentIntent (UPI intents between the two parties)
 *   activity    ← check-ins, check-outs, work proofs, payments, leave
 *
 * Working days are Mon–Sat (Sunday is treated as a weekly off) until the
 * roster carries per-worker day patterns.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { ApplicationModel } from '@/modules/applications/application.model';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';
import { PaymentIntentModel } from '@/modules/payments/payment.model';
import { WorkProofModel } from '@/modules/workProof/workProof.model';
import { computeForUser } from '@/modules/users/doondoScore.service';
import { JobModel } from '@/modules/jobs/job.model';
import { WorkerLeaveModel } from './workerLeave.model';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_SHIFT_MINUTES = 16 * 60;

/** IST calendar day for a Date, "YYYY-MM-DD". */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Minutes after IST midnight for a timestamp. */
function istMinutes(d: Date): number {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** Grace period after the scheduled start before a check-in counts as late. */
const LATE_GRACE_MINUTES = 15;

export interface WorkPattern {
  /** Weekdays worked, 0 = Sun … 6 = Sat. */
  days: number[];
  /** Scheduled start "HH:MM" (IST), null when the job has no fixed start. */
  startTime: string | null;
}

const DEFAULT_PATTERN: WorkPattern = { days: [1, 2, 3, 4, 5, 6], startTime: null };

function patternFromJob(job: unknown): WorkPattern {
  const sched = (job as { schedule?: { days?: number[]; startTime?: string | null } | null } | null)?.schedule;
  const days = Array.isArray(sched?.days) && sched!.days!.length > 0 ? sched!.days! : DEFAULT_PATTERN.days;
  const startTime = typeof sched?.startTime === 'string' && /^\d{1,2}:\d{2}$/.test(sched.startTime) ? sched.startTime : null;
  return { days, startTime };
}

function startMinutes(p: WorkPattern): number | null {
  if (!p.startTime) return null;
  const [h, m] = p.startTime.split(':').map(Number);
  return h! * 60 + m!;
}

export type DayStatus = 'present' | 'late' | 'leave' | 'absent' | 'off' | 'before_hire' | 'future';

export interface AttendanceStats {
  /** 0–100, null when there are no working days yet to measure. Late days count as attended. */
  percent: number | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  workingDays: number;
}

export interface ShiftRow {
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  minutes: number | null;
}

export interface ActivityEvent {
  at: string;
  kind: 'check_in' | 'check_out' | 'work_proof' | 'payment' | 'leave' | 'hired';
  label: string;
}

export interface PaymentRow {
  id: string;
  amountPaise: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export interface WorkerSummary {
  applicationId: string;
  seekerId: string;
  displayId: string;
  hiredAt: string | null;
  endedAt: string | null;
  score: number | null;
  attendance: AttendanceStats;
  today: { date: string; checkInAt: string | null; checkOutAt: string | null; onLeave: boolean };
  lastPaidAt: string | null;
}

export interface WorkerDetail extends WorkerSummary {
  pattern: WorkPattern;
  range: { startDay: string; endDay: string };
  calendar: Array<{ date: string; status: DayStatus }>;
  shifts: ShiftRow[];
  activity: ActivityEvent[];
  payments: PaymentRow[];
  totals: { paidPaise: number; pendingPaise: number };
  leaves: Array<{ date: string; reason: string | null }>;
}

async function loadOwnedHire(employerId: string, applicationId: string) {
  if (!Types.ObjectId.isValid(applicationId)) throw errors.notFound('Worker not found.');
  const app = await ApplicationModel.findById(applicationId);
  if (!app || app.employerId.toString() !== employerId) throw errors.notFound('Worker not found.');
  if (app.status !== 'hired') throw errors.conflict('This person is not a hired worker.');
  return app;
}

function displayIdFor(seekerId: string): string {
  return `DW-${seekerId.slice(-6).toUpperCase()}`;
}

/**
 * Build the day-by-day calendar + stats for one hire over [startDay, endDay].
 * `firstIn` maps IST day → minutes-after-midnight of that day's first check-in.
 */
function buildAttendance(
  hiredAt: Date | null | undefined,
  endedAt: Date | null | undefined,
  firstIn: Map<string, number>,
  leaveDays: Set<string>,
  startDay: string,
  endDay: string,
  pattern: WorkPattern = DEFAULT_PATTERN,
): { calendar: Array<{ date: string; status: DayStatus }>; stats: AttendanceStats } {
  const today = istDay(new Date());
  const hireDay = hiredAt ? istDay(hiredAt) : null;
  const endedDay = endedAt ? istDay(endedAt) : null;
  const lateAfter = startMinutes(pattern);
  const calendar: Array<{ date: string; status: DayStatus }> = [];
  let present = 0;
  let late = 0;
  let absent = 0;
  let leave = 0;
  for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
    let status: DayStatus;
    const inAt = firstIn.get(day);
    if (day > today) status = 'future';
    else if ((hireDay && day < hireDay) || (endedDay && day > endedDay)) status = 'before_hire';
    else if (inAt !== undefined) {
      status = lateAfter !== null && inAt > lateAfter + LATE_GRACE_MINUTES ? 'late' : 'present';
    } else if (leaveDays.has(day)) status = 'leave';
    else if (!pattern.days.includes(weekday(day))) status = 'off';
    // Today isn't "absent" until the day is over.
    else if (day === today) status = 'future';
    else status = 'absent';
    if (status === 'present') present++;
    if (status === 'late') late++;
    if (status === 'absent') absent++;
    if (status === 'leave') leave++;
    calendar.push({ date: day, status });
  }
  const workingDays = present + late + absent;
  return {
    calendar,
    stats: {
      percent: workingDays > 0 ? Math.round(((present + late) / workingDays) * 100) : null,
      present,
      late,
      absent,
      leave,
      workingDays,
    },
  };
}

function firstCheckIns(rows: Array<{ kind: string; timestamp: Date }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== 'check_in') continue;
    const day = istDay(r.timestamp);
    const m = istMinutes(r.timestamp);
    const prev = out.get(day);
    if (prev === undefined || m < prev) out.set(day, m);
  }
  return out;
}

/** Resolve the [start, end] IST days for either a trailing window or a calendar month. */
export function resolveRange(opts: { days?: number; month?: string }): { startDay: string; endDay: string; since: Date } {
  const m = (opts.month ?? '').match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const startDay = `${m[1]}-${m[2]}-01`;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const endDay = `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
    return { startDay, endDay, since: new Date(new Date(`${startDay}T00:00:00Z`).getTime() - IST_OFFSET_MS) };
  }
  const days = opts.days ?? 30;
  const endDay = istDay(new Date());
  const startDay = addDays(endDay, -(days - 1));
  return { startDay, endDay, since: new Date(new Date(`${startDay}T00:00:00Z`).getTime() - IST_OFFSET_MS) };
}

function pairShifts(
  rows: Array<{ kind: string; timestamp: Date }>,
): ShiftRow[] {
  const sorted = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const out: ShiftRow[] = [];
  let open: Date | null = null;
  for (const r of sorted) {
    if (r.kind === 'check_in') {
      if (open) out.push({ date: istDay(open), checkInAt: open.toISOString(), checkOutAt: null, minutes: null });
      open = r.timestamp;
    } else if (r.kind === 'check_out' && open) {
      const minutes = Math.min(
        MAX_SHIFT_MINUTES,
        Math.round((r.timestamp.getTime() - open.getTime()) / 60000),
      );
      out.push({ date: istDay(open), checkInAt: open.toISOString(), checkOutAt: r.timestamp.toISOString(), minutes });
      open = null;
    }
  }
  if (open) out.push({ date: istDay(open), checkInAt: open.toISOString(), checkOutAt: null, minutes: null });
  return out.reverse();
}

async function safeScore(seekerId: string): Promise<number | null> {
  try {
    return (await computeForUser(seekerId)).score;
  } catch {
    return null;
  }
}

/** Compact per-worker numbers for every active hire — powers the Workers tab + payroll. */
export async function listSummaries(employerId: string, days = 30): Promise<WorkerSummary[]> {
  const apps = await ApplicationModel.find({
    employerId: new Types.ObjectId(employerId),
    status: 'hired',
    endedAt: null,
  })
    .sort({ hiredAt: -1 })
    .limit(200);
  if (apps.length === 0) return [];

  const appIds = apps.map((a) => a._id);
  const { startDay, endDay, since } = resolveRange({ days });
  const sinceDay = startDay;
  const today = istDay(new Date());

  const [checkIns, leaves, payments, scores, jobs] = await Promise.all([
    ShiftCheckInModel.find({ applicationId: { $in: appIds }, timestamp: { $gte: since } })
      .select('applicationId kind timestamp')
      .lean(),
    WorkerLeaveModel.find({ applicationId: { $in: appIds }, date: { $gte: sinceDay } })
      .select('applicationId date')
      .lean(),
    PaymentIntentModel.find({ employerId: new Types.ObjectId(employerId), status: 'paid' })
      .select('seekerId paidAt')
      .sort({ paidAt: -1 })
      .lean(),
    Promise.all(apps.map((a) => safeScore(a.seekerId.toString()))),
    JobModel.find({ _id: { $in: [...new Set(apps.map((a) => a.jobId.toString()))] } }).select('schedule').lean(),
  ]);
  const patterns = new Map(jobs.map((j) => [String(j._id), patternFromJob(j)]));

  const lastPaid = new Map<string, Date>();
  for (const p of payments) {
    const k = p.seekerId.toString();
    if (p.paidAt && !lastPaid.has(k)) lastPaid.set(k, p.paidAt);
  }

  return apps.map((a, i) => {
    const id = a._id.toString();
    const mine = checkIns.filter((c) => c.applicationId.toString() === id);
    const leaveSet = new Set(leaves.filter((l) => l.applicationId.toString() === id).map((l) => l.date));
    const { stats } = buildAttendance(
      a.hiredAt, a.endedAt, firstCheckIns(mine), leaveSet, startDay, endDay, patterns.get(a.jobId.toString()),
    );
    const todays = mine.filter((c) => istDay(c.timestamp) === today).sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
    const inRow = todays.find((c) => c.kind === 'check_in');
    const outRow = [...todays].reverse().find((c) => c.kind === 'check_out');
    const seekerId = a.seekerId.toString();
    return {
      applicationId: id,
      seekerId,
      displayId: displayIdFor(seekerId),
      hiredAt: a.hiredAt ? a.hiredAt.toISOString() : null,
      endedAt: a.endedAt ? a.endedAt.toISOString() : null,
      score: scores[i] ?? null,
      attendance: stats,
      today: {
        date: today,
        checkInAt: inRow ? inRow.timestamp.toISOString() : null,
        checkOutAt: outRow ? outRow.timestamp.toISOString() : null,
        onLeave: leaveSet.has(today),
      },
      lastPaidAt: lastPaid.get(seekerId)?.toISOString() ?? null,
    };
  });
}

/** Full picture for one hired worker. */
export async function getWorkerDetail(
  employerId: string,
  applicationId: string,
  range: { days?: number; month?: string } = {},
): Promise<WorkerDetail> {
  const app = await loadOwnedHire(employerId, applicationId);
  const seekerId = app.seekerId.toString();
  const { startDay, endDay, since } = resolveRange(range);
  const sinceDay = startDay;
  const until = new Date(new Date(`${addDays(endDay, 1)}T00:00:00Z`).getTime() - IST_OFFSET_MS);
  const today = istDay(new Date());

  const [checkIns, leaves, payments, proof, score, job] = await Promise.all([
    ShiftCheckInModel.find({ applicationId: app._id, timestamp: { $gte: since, $lt: until } })
      .select('kind timestamp')
      .lean(),
    WorkerLeaveModel.find({ applicationId: app._id, date: { $gte: sinceDay, $lte: endDay } }).sort({ date: -1 }).lean(),
    PaymentIntentModel.find({ employerId: app.employerId, seekerId: app.seekerId })
      .sort({ createdAt: -1 })
      .limit(24)
      .lean(),
    WorkProofModel.findOne({ applicationId: app._id }).lean(),
    safeScore(seekerId),
    JobModel.findById(app.jobId).select('schedule').lean(),
  ]);

  const leaveSet = new Set(leaves.map((l) => l.date));
  const pattern = patternFromJob(job);
  const { calendar, stats } = buildAttendance(
    app.hiredAt, app.endedAt, firstCheckIns(checkIns), leaveSet, startDay, endDay, pattern,
  );
  // Today's leave flag must hold even when browsing a past month.
  const onLeaveToday =
    leaveSet.has(today) ||
    Boolean(await WorkerLeaveModel.exists({ applicationId: app._id, date: today }));
  const shifts = pairShifts(checkIns);
  const todayShift = shifts.find((s) => s.date === today) ?? null;

  const activity: ActivityEvent[] = [];
  for (const c of checkIns) {
    activity.push({
      at: c.timestamp.toISOString(),
      kind: c.kind,
      label: c.kind === 'check_in' ? 'Checked in' : 'Checked out',
    });
  }
  for (const l of leaves) {
    activity.push({ at: `${l.date}T03:30:00.000Z`, kind: 'leave', label: l.reason ? `On leave — ${l.reason}` : 'On leave' });
  }
  for (const p of payments) {
    if (p.status === 'paid' && p.paidAt) {
      activity.push({ at: p.paidAt.toISOString(), kind: 'payment', label: `Paid ₹${Math.round(p.amountPaise / 100).toLocaleString('en-IN')}` });
    }
  }
  if (proof) {
    activity.push({ at: proof.submittedAt.toISOString(), kind: 'work_proof', label: 'Sent a work photo' });
  }
  if (app.hiredAt) activity.push({ at: app.hiredAt.toISOString(), kind: 'hired', label: 'Hired' });
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  let paidPaise = 0;
  let pendingPaise = 0;
  for (const p of payments) {
    if (p.status === 'paid') paidPaise += p.amountPaise;
    else if (p.status === 'pending' || p.status === 'in_progress') pendingPaise += p.amountPaise;
  }
  const lastPaid = payments.find((p) => p.status === 'paid' && p.paidAt);

  return {
    applicationId: app.id,
    seekerId,
    displayId: displayIdFor(seekerId),
    hiredAt: app.hiredAt ? app.hiredAt.toISOString() : null,
    endedAt: app.endedAt ? app.endedAt.toISOString() : null,
    score,
    attendance: stats,
    today: {
      date: today,
      checkInAt: todayShift?.checkInAt ?? null,
      checkOutAt: todayShift?.checkOutAt ?? null,
      onLeave: onLeaveToday,
    },
    lastPaidAt: lastPaid?.paidAt ? lastPaid.paidAt.toISOString() : null,
    pattern,
    range: { startDay, endDay },
    calendar,
    shifts: shifts.slice(0, 30),
    activity: activity.slice(0, 60),
    payments: payments.map((p) => ({
      id: p._id.toString(),
      amountPaise: p.amountPaise,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    })),
    totals: { paidPaise, pendingPaise },
    leaves: leaves.map((l) => ({ date: l.date, reason: l.reason ?? null })),
  };
}

export async function markLeave(
  employerId: string,
  applicationId: string,
  input: { date?: string; reason?: string | null },
): Promise<{ date: string; reason: string | null }> {
  const app = await loadOwnedHire(employerId, applicationId);
  if (app.endedAt) throw errors.conflict('This worker is no longer on your team.');
  const date = input.date ?? istDay(new Date());
  const reason = input.reason?.trim() || null;
  await WorkerLeaveModel.updateOne(
    { applicationId: app._id, date },
    {
      $set: { reason },
      $setOnInsert: { employerId: app.employerId, seekerId: app.seekerId, applicationId: app._id, date },
    },
    { upsert: true },
  );
  return { date, reason };
}

export async function cancelLeave(employerId: string, applicationId: string, date: string): Promise<void> {
  const app = await loadOwnedHire(employerId, applicationId);
  await WorkerLeaveModel.deleteOne({ applicationId: app._id, date });
}

/** End a hired worker's employment. Keeps the application (status 'hired') for history. */
export async function endEmployment(
  employerId: string,
  applicationId: string,
  reason?: string | null,
): Promise<{ endedAt: string }> {
  const app = await loadOwnedHire(employerId, applicationId);
  if (!app.endedAt) {
    app.endedAt = new Date();
    app.endReason = reason?.trim() || null;
    await app.save();
  }
  return { endedAt: app.endedAt!.toISOString() };
}
