/**
 * Live in-shift coaching — a worker on an active shift asks a quick
 * question ("how do I fix a dripping tap?", "customer wants extra work,
 * what do I charge?") and gets a short, practical, safety-first answer
 * grounded in the job they're on. Text in, text out; the app reads it
 * aloud. Uses lib/llm with a deterministic fallback so it always answers.
 *
 * Guard rails: only for hired workers with an open check-in today; capped
 * at 30 questions per shift-day; emergencies are routed to SOS, never
 * "coached".
 */
import { Schema, model, type Model, Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { generateText } from '@/lib/llm';
import { ApplicationModel } from '@/modules/applications/application.model';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';

const DAILY_CAP = 30;
const EMERGENCY = /(fire|aag|आग|bleed|blood|खून|electric shock|current laga|करंट|unconscious|बेहोश|fell|gir gaya|गिर|harass|छेड़|threat|धमकी|sos)/i;
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada' };

interface CoachLog { seekerId: Types.ObjectId; day: string; question: string; answer: string; createdAt: Date }
const logSchema = new Schema<CoachLog>({
  seekerId: { type: Schema.Types.ObjectId, required: true, index: true },
  day: { type: String, required: true },
  question: { type: String, maxlength: 500 },
  answer: { type: String, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});
const CoachLogModel = model('ShiftCoachLog', logSchema) as Model<CoachLog>;

export interface CoachAnswer {
  answer: string;
  emergency: boolean;
  source: 'ai' | 'fallback';
  remainingToday: number;
}

function istDay(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function askCoach(seekerId: string, applicationId: string, question: string): Promise<CoachAnswer> {
  if (!Types.ObjectId.isValid(applicationId)) throw errors.applicationNotFound();
  const app = await ApplicationModel.findOne({ _id: applicationId, seekerId: new Types.ObjectId(seekerId), status: 'hired' }).select('jobId').lean();
  if (!app) throw errors.applicationNotFound();
  const since = new Date(Date.now() - 16 * 3600 * 1000);
  const last = await ShiftCheckInModel.findOne({ applicationId: app._id, timestamp: { $gte: since } }).sort({ timestamp: -1 }).select('kind').lean();
  if (!last || last.kind !== 'check_in') throw errors.conflict('Coaching is available while you are checked in to a shift.');

  const day = istDay();
  const used = await CoachLogModel.countDocuments({ seekerId: new Types.ObjectId(seekerId), day });
  if (used >= DAILY_CAP) throw errors.conflict("You've used today's coaching questions. Try again tomorrow.");

  if (EMERGENCY.test(question)) {
    return {
      answer: 'This sounds like an emergency. Stop work, move to safety, and press SOS in Doondo now — or call 112.',
      emergency: true,
      source: 'fallback',
      remainingToday: DAILY_CAP - used,
    };
  }

  const [job, user] = await Promise.all([
    JobModel.findById(app.jobId).select('title skills description').lean(),
    UserModel.findById(seekerId).select('locale skills').lean(),
  ]);
  const locale = ((user as { locale?: string } | null)?.locale ?? 'en').slice(0, 2);
  const j = job as { title?: string; skills?: string[]; description?: string } | null;
  const fallback =
    `Good question. Work safely first: stop if anything feels unsafe. For "${question.slice(0, 80)}", ` +
    'check with your supervisor or employer before changing the plan, and note what you did in your shift notes. ' +
    'If extra work is asked, agree the pay before you start.';
  const r = await generateText({
    system:
      `You are Doondo Coach, helping a ${j?.title ?? 'worker'} in India during a live shift. Reply in ${LANG[locale] ?? 'English'} ` +
      'in at most 4 short sentences, simple words, practical steps they can do now. Safety first: never suggest anything risky; ' +
      'for electrical/gas/heights, tell them to stop and get a qualified person if unsure. For pay questions, advise agreeing pay before extra work. ' +
      'If it is an emergency, tell them to press SOS. No markdown.',
    prompt: JSON.stringify({ job: j?.title, skills: j?.skills ?? [], question }),
    maxTokens: 220,
    fallback,
  });
  await CoachLogModel.create({ seekerId: new Types.ObjectId(seekerId), day, question: question.slice(0, 500), answer: r.text.slice(0, 2000) });
  return { answer: r.text, emergency: false, source: r.source, remainingToday: DAILY_CAP - used - 1 };
}
