/**
 * Voice agent service — runs one conversational turn of the voice
 * job-search assistant.
 *
 * The flow per turn:
 *   1. The mobile records the worker speaking and (with the speech-to-
 *      text layer) turns it into a transcript.
 *   2. `parseVoiceIntent` classifies that transcript.
 *   3. This service acts on the intent — runs a real job search, or
 *      submits a real application — and returns a structured result.
 *   4. The mobile turns the structured result into a spoken sentence in
 *      the worker's language (the reply text lives in the mobile i18n
 *      files, so all five languages stay in one place) and reads it out.
 *
 * Nothing here is faked: a search hits the same `findNearby` geo query
 * the Jobs feed uses, and an apply goes through the same `apply` service
 * the Apply button uses — so a voice apply is a real application, with
 * the same employer notification, streak bump and de-duplication.
 *
 * "Apply to the second one" is resolved against `contextJobIds` — the
 * id list from the previous turn's results, round-tripped through the
 * client. The agent itself is stateless; the conversation's short-term
 * memory rides on the request.
 */

import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as jobService from '@/modules/jobs/job.service';
import * as applicationService from '@/modules/applications/application.service';
import type { PublicJob } from '@/modules/jobs/job.model';
import type { NearbyQuery } from '@/modules/jobs/job.schemas';
import { parseVoiceIntent, type VoiceIntent } from './intent';

/**
 * The shape of what happened this turn. The mobile maps each value to a
 * localized spoken sentence.
 */
export type VoiceOutcome =
  /** A search ran and found jobs (`jobs` is populated). */
  | 'results'
  /** A search ran but found nothing nearby. */
  | 'no_results'
  /** An apply succeeded (`appliedJob` is populated). */
  | 'applied'
  /** The worker had already applied to that job earlier. */
  | 'already_applied'
  /** An apply was attempted but failed (job closed, server error, …). */
  | 'apply_failed'
  /** The worker said "apply" before any search results existed. */
  | 'need_search_first'
  /** The worker asked the agent to repeat its last reply. */
  | 'repeat'
  /** The worker asked what the agent can do. */
  | 'help'
  /** Upcoming interviews (`interviews` populated; may be empty). */
  | 'interviews'
  /** Application summary (`status` populated). */
  | 'status'
  /** Latest unread messages (`messages` populated; may be empty). */
  | 'messages'
  /** Nothing intelligible was heard. */
  | 'not_understood';

export interface VoiceTurnInput {
  /** The authenticated seeker driving the conversation. */
  seekerId: string;
  /** The recognised speech for this turn. */
  transcript: string;
  /** Where the worker is — drives the job search. */
  lat: number;
  lng: number;
  /** Result ids from the previous turn, so "the second one" resolves. */
  contextJobIds: string[];
}

export interface VoiceTurnResult {
  intent: VoiceIntent;
  outcome: VoiceOutcome;
  /** The transcript the agent acted on (echoed so the UI can show it). */
  transcript: string;
  /** Search results to read aloud + render as cards. Empty otherwise. */
  jobs: PublicJob[];
  /** The job an apply landed on, when `outcome` is applied/already_applied. */
  appliedJob: { id: string; title: string } | null;
  /** Result ids the client should send back on the next turn. */
  contextJobIds: string[];
  /** Upcoming interviews, soonest first (outcome 'interviews'). */
  interviews?: Array<{ jobTitle: string; at: string; mode: string; location: string | null }>;
  /** Application counts + the latest change (outcome 'status'). */
  status?: {
    pending: number; shortlisted: number; hired: number; rejected: number;
    latest: { jobTitle: string; status: string } | null;
  };
  /** Latest conversations with unread messages (outcome 'messages'). */
  messages?: Array<{ from: string; preview: string; at: string; unread: number; conversationId: string }>;
}

/** How many results the agent reads back — kept small, it is spoken aloud. */
const SPOKEN_RESULT_LIMIT = 3;

/**
 * Search radius for voice queries (metres). Wider than the Today feed:
 * a worker browsing by voice is exploring, not committing to a same-day
 * shift, so a roomier net gives the agent something to say.
 */
const VOICE_SEARCH_RADIUS_M = 12_000;

/** Look up a job title for the spoken reply; never throws. */
async function jobTitleOrFallback(jobId: string): Promise<string> {
  try {
    const job = await jobService.findById(jobId);
    return job.title;
  } catch {
    return 'this job';
  }
}

/**
 * Run one turn of the voice agent. Pure-ish orchestration: it parses the
 * transcript, then either searches, applies, or returns a conversational
 * outcome. Errors from the apply path are caught and folded into an
 * `apply_failed` outcome so the agent can always say something back —
 * a voice assistant going silent on an error is the worst outcome.
 */
export async function runVoiceTurn(
  input: VoiceTurnInput,
): Promise<VoiceTurnResult> {
  const intent = parseVoiceIntent(input.transcript);

  const base = {
    intent,
    transcript: input.transcript,
    jobs: [] as PublicJob[],
    appliedJob: null as VoiceTurnResult['appliedJob'],
    contextJobIds: input.contextJobIds,
  };

  if (intent.kind === 'unknown') return { ...base, outcome: 'not_understood' };
  if (intent.kind === 'help') return { ...base, outcome: 'help' };
  if (intent.kind === 'repeat') return { ...base, outcome: 'repeat' };
  if (intent.kind === 'interviews') return { ...base, outcome: 'interviews', interviews: await upcomingInterviews(input.seekerId) };
  if (intent.kind === 'status') return { ...base, outcome: 'status', status: await applicationStatus(input.seekerId) };
  if (intent.kind === 'messages') return { ...base, outcome: 'messages', messages: await latestMessages(input.seekerId) };

  // ─── search ───────────────────────────────────────────────────────────
  if (intent.kind === 'search') {
    const query: NearbyQuery = {
      lat: input.lat,
      lng: input.lng,
      radius: VOICE_SEARCH_RADIUS_M,
      limit: SPOKEN_RESULT_LIMIT,
      ...(intent.query ? { q: intent.query } : {}),
    };
    const { jobs } = await jobService.findNearby(query);
    const top = jobs.slice(0, SPOKEN_RESULT_LIMIT);
    logger.info(
      { seekerId: input.seekerId, q: intent.query || '(nearby)', found: top.length },
      'voice agent search',
    );
    return {
      ...base,
      outcome: top.length > 0 ? 'results' : 'no_results',
      jobs: top,
      contextJobIds: top.map((j) => j.id),
    };
  }

  // ─── apply ────────────────────────────────────────────────────────────
  const position = intent.index ?? 1;
  const jobId = input.contextJobIds[position - 1];
  if (!jobId) {
    return { ...base, outcome: 'need_search_first' };
  }

  try {
    await applicationService.apply({ seekerId: input.seekerId, jobId });
    logger.info({ seekerId: input.seekerId, jobId }, 'voice agent apply submitted');
    return {
      ...base,
      outcome: 'applied',
      appliedJob: { id: jobId, title: await jobTitleOrFallback(jobId) },
    };
  } catch (err) {
    if (err instanceof AppError && err.code === 'APPLICATION_ALREADY_EXISTS') {
      return {
        ...base,
        outcome: 'already_applied',
        appliedJob: { id: jobId, title: await jobTitleOrFallback(jobId) },
      };
    }
    logger.warn({ err, seekerId: input.seekerId, jobId }, 'voice agent apply failed');
    return { ...base, outcome: 'apply_failed' };
  }
}


// ─── Read-only "about me" intents ─────────────────────────────────────────

async function titlesFor(jobIds: Array<{ toString(): string }>): Promise<Map<string, string>> {
  const { JobModel } = await import('@/modules/jobs/job.model');
  const jobs = await JobModel.find({ _id: { $in: jobIds.map((j) => j.toString()) } }).select('title').lean();
  return new Map(jobs.map((j) => [String(j._id), (j as { title?: string }).title ?? 'a job']));
}

async function upcomingInterviews(seekerId: string): Promise<NonNullable<VoiceTurnResult['interviews']>> {
  const { ApplicationModel } = await import('@/modules/applications/application.model');
  const { Types } = await import('mongoose');
  const apps = await ApplicationModel.find({
    seekerId: new Types.ObjectId(seekerId),
    'interview.status': 'scheduled',
    'interview.scheduledAt': { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  })
    .select('jobId interview')
    .sort({ 'interview.scheduledAt': 1 })
    .limit(3)
    .lean();
  const titles = await titlesFor(apps.map((a) => a.jobId));
  return apps.map((a) => {
    const iv = a.interview as unknown as { scheduledAt: Date; mode?: string; location?: string | null; meetingUrl?: string | null };
    return {
      jobTitle: titles.get(a.jobId.toString()) ?? 'a job',
      at: new Date(iv.scheduledAt).toISOString(),
      mode: iv.mode ?? 'in_person',
      location: iv.location ?? null,
    };
  });
}

async function applicationStatus(seekerId: string): Promise<NonNullable<VoiceTurnResult['status']>> {
  const { ApplicationModel } = await import('@/modules/applications/application.model');
  const { Types } = await import('mongoose');
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const apps = await ApplicationModel.find({ seekerId: new Types.ObjectId(seekerId), createdAt: { $gte: since } })
    .select('jobId status updatedAt')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  const count = (st: string) => apps.filter((a) => a.status === st).length;
  const latest = apps.find((a) => a.status !== 'pending' && a.status !== 'withdrawn');
  const titles = latest ? await titlesFor([latest.jobId]) : new Map<string, string>();
  return {
    pending: count('pending') + count('viewed'),
    shortlisted: count('shortlisted'),
    hired: count('hired'),
    rejected: count('rejected'),
    latest: latest ? { jobTitle: titles.get(latest.jobId.toString()) ?? 'a job', status: latest.status } : null,
  };
}

async function latestMessages(seekerId: string): Promise<NonNullable<VoiceTurnResult['messages']>> {
  const { ConversationModel } = await import('@/modules/chat/conversation.model');
  const { UserModel } = await import('@/modules/users/user.model');
  const { Types } = await import('mongoose');
  const convs = await ConversationModel.find({ seekerId: new Types.ObjectId(seekerId), unreadSeeker: { $gt: 0 } })
    .sort({ lastMessageAt: -1 })
    .limit(3)
    .lean();
  const users = await UserModel.find({ _id: { $in: convs.map((c) => c.employerId) } }).select('name companyName').lean();
  const nm = new Map(users.map((u) => [String(u._id), (u as { companyName?: string | null; name?: string }).companyName || (u as { name?: string }).name || 'An employer']));
  return convs.map((c) => ({
    from: nm.get(c.employerId.toString()) ?? 'An employer',
    preview: c.lastMessagePreview ?? '',
    at: c.lastMessageAt.toISOString(),
    unread: c.unreadSeeker,
    conversationId: String(c._id),
  }));
}
