/**
 * Predictive availability — "when is this worker usually free?"
 *
 * A transparent frequency model (no black box): over the last 90 days we
 * count, per weekday × part-of-day, the times the worker
 *   - published an availability beacon (logged here, since beacons are
 *     TTL-deleted when they expire), and
 *   - checked in to a shift (they were evidently free to work then).
 * Each cell's likelihood = its share of the worker's active weeks. With
 * fewer than MIN_EVENTS signals we return null rather than guess.
 */
import { Schema, model, type Model, Types } from 'mongoose';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;
const MIN_EVENTS = 5;

export type DayPart = 'morning' | 'afternoon' | 'evening';
const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];

function partOf(hour: number): DayPart | null {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 23) return 'evening';
  return null;
}

interface AvailabilityLog { seekerId: Types.ObjectId; weekday: number; parts: DayPart[]; createdAt: Date }
const logSchema = new Schema<AvailabilityLog>({
  seekerId: { type: Schema.Types.ObjectId, required: true, index: true },
  weekday: { type: Number, required: true, min: 0, max: 6 },
  parts: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 120 },
});
export const AvailabilityLogModel = model('AvailabilityLog', logSchema) as Model<AvailabilityLog>;

function ist(d: Date): { weekday: number; hour: number; week: string } {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = `${t.getUTCFullYear()}-${Math.floor((t.getTime() - jan1) / (7 * 864e5))}`;
  return { weekday: t.getUTCDay(), hour: t.getUTCHours(), week };
}

/** Record a beacon publish. Recurring patterns log every listed day. */
export async function logBeacon(input: {
  seekerId: string;
  durationMinutes: number;
  recurringPattern?: { days: number[]; startTime: string; endTime: string } | null;
}): Promise<void> {
  const seekerId = new Types.ObjectId(input.seekerId);
  if (input.recurringPattern) {
    const sh = Number(input.recurringPattern.startTime.slice(0, 2));
    const eh = Number(input.recurringPattern.endTime.slice(0, 2));
    const parts = PARTS.filter((p) => [...Array(Math.max(1, eh - sh)).keys()].some((i) => partOf(sh + i) === p));
    await AvailabilityLogModel.insertMany(input.recurringPattern.days.map((weekday) => ({ seekerId, weekday, parts })));
    return;
  }
  const now = new Date();
  const start = ist(now);
  const hours = Math.max(1, Math.ceil(input.durationMinutes / 60));
  const parts = [...new Set([...Array(hours).keys()].map((i) => partOf((start.hour + i) % 24)).filter(Boolean))] as DayPart[];
  await AvailabilityLogModel.create({ seekerId, weekday: start.weekday, parts });
}

export interface AvailabilityPrediction {
  /** likelihood[weekday][part] in 0..1 (weekday 0 = Sunday). */
  likelihood: Array<Record<DayPart, number>>;
  /** Up to 3 strongest windows, strongest first. */
  top: Array<{ weekday: number; part: DayPart; likelihood: number }>;
  basedOn: number;
}

export async function predictAvailability(seekerId: string): Promise<AvailabilityPrediction | null> {
  if (!Types.ObjectId.isValid(seekerId)) return null;
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const oid = new Types.ObjectId(seekerId);
  const [logs, checkIns] = await Promise.all([
    AvailabilityLogModel.find({ seekerId: oid, createdAt: { $gte: since } }).select('weekday parts createdAt').lean(),
    ShiftCheckInModel.find({ seekerId: oid, kind: 'check_in', timestamp: { $gte: since } }).select('timestamp').lean(),
  ]);
  const events = logs.length + checkIns.length;
  if (events < MIN_EVENTS) return null;

  // Count distinct weeks per cell so one busy week doesn't dominate.
  const cellWeeks = new Map<string, Set<string>>();
  const weeks = new Set<string>();
  const add = (weekday: number, part: DayPart, week: string) => {
    const k = `${weekday}:${part}`;
    if (!cellWeeks.has(k)) cellWeeks.set(k, new Set());
    cellWeeks.get(k)!.add(week);
    weeks.add(week);
  };
  for (const l of logs) {
    const w = ist(l.createdAt).week;
    for (const p of l.parts as DayPart[]) add(l.weekday, p, w);
  }
  for (const c of checkIns) {
    const { weekday, hour, week } = ist(c.timestamp);
    const p = partOf(hour);
    if (p) add(weekday, p, week);
  }
  const totalWeeks = Math.max(1, weeks.size);
  const likelihood = [...Array(7).keys()].map((d) =>
    Object.fromEntries(PARTS.map((p) => [p, Math.round(((cellWeeks.get(`${d}:${p}`)?.size ?? 0) / totalWeeks) * 100) / 100])) as Record<DayPart, number>,
  );
  const top = likelihood
    .flatMap((row, weekday) => PARTS.map((part) => ({ weekday, part, likelihood: row[part] })))
    .filter((c) => c.likelihood >= 0.4)
    .sort((a, b) => b.likelihood - a.likelihood)
    .slice(0, 3);
  return { likelihood, top, basedOn: events };
}
