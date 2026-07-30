import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { employerResponseSettings } from '@/db/schema';

export interface ResponseSettingsView { quietHoursEnabled: boolean; quietStartHour: number; quietEndHour: number; autoReply: string; smsApplicantAlerts: boolean; }
const DEFAULTS: ResponseSettingsView = { quietHoursEnabled: false, quietStartHour: 21, quietEndHour: 7, autoReply: '', smsApplicantAlerts: false };
const IST_OFFSET_MINUTES = 330;
export function istHour(now: Date): number { return new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000).getUTCHours(); }
export function isWithinQuietHours(s: Pick<ResponseSettingsView, 'quietHoursEnabled' | 'quietStartHour' | 'quietEndHour'>, now: Date): boolean { if (!s.quietHoursEnabled || s.quietStartHour === s.quietEndHour) return false; const hour = istHour(now); return s.quietStartHour < s.quietEndHour ? hour >= s.quietStartHour && hour < s.quietEndHour : hour >= s.quietStartHour || hour < s.quietEndHour; }
function view(row: typeof employerResponseSettings.$inferSelect): ResponseSettingsView { return { quietHoursEnabled: row.quietHoursEnabled, quietStartHour: row.quietStartHour, quietEndHour: row.quietEndHour, autoReply: row.autoReply, smsApplicantAlerts: row.smsApplicantAlerts }; }
export async function getSettings(employerId: string): Promise<ResponseSettingsView> { const [row] = await getDb().select().from(employerResponseSettings).where(eq(employerResponseSettings.employerId, employerId)).limit(1); return row ? view(row) : { ...DEFAULTS }; }
export async function wantsSmsApplicantAlerts(employerId: string): Promise<boolean> { return (await getSettings(employerId)).smsApplicantAlerts; }
export async function setSettings(employerId: string, patch: ResponseSettingsView): Promise<ResponseSettingsView> { const [row] = await getDb().insert(employerResponseSettings).values({ employerId, ...patch }).onConflictDoUpdate({ target: employerResponseSettings.employerId, set: patch }).returning(); return view(row!); }
export async function employersInQuietHours(employerIds: string[], now: Date): Promise<Set<string>> { if (!employerIds.length) return new Set(); const rows = await getDb().select().from(employerResponseSettings).where(inArray(employerResponseSettings.employerId, employerIds)); return new Set(rows.filter((row) => isWithinQuietHours(view(row), now)).map((row) => row.employerId)); }
