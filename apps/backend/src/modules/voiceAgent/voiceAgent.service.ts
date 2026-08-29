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

import { and, asc, eq, gt } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDb } from '@/db/client';
import { applications, jobs, users } from '@/db/schema';
import * as jobService from '@/modules/jobs/job.service';
import * as applicationService from '@/modules/applications/application.service';
import * as chatService from '@/modules/chat/chat.service';
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
  /** The worker asked about an interview and one is scheduled (`upcomingInterview` populated). */
  | 'interview_upcoming'
  /** The worker asked about an interview and none are scheduled. */
  | 'interview_none'
  /** The worker asked the agent to read messages and there's at least one (`latestMessages` populated). */
  | 'messages_found'
  /** The worker asked the agent to read messages and there are none from an employer. */
  | 'no_messages'
  /** Nothing intelligible was heard. */
  | 'not_understood';

/** The next scheduled interview, read back to the worker. */
export interface UpcomingInterview {
  applicationId: string;
  jobTitle: string;
  employerName: string;
  scheduledFor: string;
  mode: 'in_person' | 'video' | 'phone';
  location: string | null;
}

/** One conversation's latest employer message, read back to the worker. */
export interface SpokenMessage {
  conversationId: string;
  senderName: string;
  body: string;
}

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
  /** Populated when `outcome === 'interview_upcoming'`. */
  upcomingInterview: UpcomingInterview | null;
  /** Populated when `outcome === 'messages_found'` — newest first, capped small since it's spoken. */
  latestMessages: SpokenMessage[];
  /** Result ids the client should send back on the next turn. */
  contextJobIds: string[];
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
 * The seeker's next scheduled interview across every application, soonest
 * first. Interviews are employer-scheduled (see application.service's
 * scheduleInterview) — the coach's job here is read-only: tell the worker
 * when it is, not mutate anything.
 */
async function findUpcomingInterview(seekerId: string): Promise<UpcomingInterview | null> {
  const [row] = await getDb()
    .select({
      applicationId: applications.id,
      scheduledFor: applications.interviewAt,
      mode: applications.interviewMode,
      details: applications.interviewDetails,
      jobTitle: jobs.title,
      employerName: users.name,
      employerCompany: users.companyName,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(users, eq(applications.employerId, users.id))
    .where(
      and(
        eq(applications.seekerId, seekerId),
        eq(applications.interviewStatus, 'scheduled'),
        gt(applications.interviewAt, new Date()),
      ),
    )
    .orderBy(asc(applications.interviewAt))
    .limit(1);
  if (!row || !row.scheduledFor) return null;

  return {
    applicationId: row.applicationId,
    jobTitle: row.jobTitle,
    employerName: row.employerCompany || row.employerName,
    scheduledFor: row.scheduledFor.toISOString(),
    mode: row.mode ?? 'in_person',
    location: row.details?.location ?? row.details?.meetingLink ?? null,
  };
}

/** How many of the worker's most-recently-messaged-by-an-employer conversations to read back. Kept small — it's spoken aloud. */
const SPOKEN_MESSAGE_LIMIT = 3;

/**
 * The latest message in each of the worker's conversations where an
 * employer sent the last word — "read my messages" reads these back.
 * Reuses conversations.lastMessagePreview (already computed on send), so
 * this is a single cheap query, not a per-conversation message fetch.
 */
async function findLatestEmployerMessages(seekerId: string): Promise<SpokenMessage[]> {
  const conversations = await chatService.listMine(seekerId, { limit: 20 });
  return conversations
    .filter((c) => c.lastSenderId && c.lastSenderId !== seekerId && c.lastMessagePreview)
    .slice(0, SPOKEN_MESSAGE_LIMIT)
    .map((c) => ({
      conversationId: c.id,
      senderName: c.counterpart?.companyName || c.counterpart?.name || 'An employer',
      body: c.lastMessagePreview!,
    }));
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
    upcomingInterview: null as VoiceTurnResult['upcomingInterview'],
    latestMessages: [] as SpokenMessage[],
    contextJobIds: input.contextJobIds,
  };

  if (intent.kind === 'unknown') return { ...base, outcome: 'not_understood' };
  if (intent.kind === 'help') return { ...base, outcome: 'help' };
  if (intent.kind === 'repeat') return { ...base, outcome: 'repeat' };

  // ─── interviews ─────────────────────────────────────────────────────
  if (intent.kind === 'interviews') {
    const upcoming = await findUpcomingInterview(input.seekerId);
    return {
      ...base,
      outcome: upcoming ? 'interview_upcoming' : 'interview_none',
      upcomingInterview: upcoming,
    };
  }

  // ─── messages ───────────────────────────────────────────────────────
  if (intent.kind === 'messages') {
    const latest = await findLatestEmployerMessages(input.seekerId);
    return {
      ...base,
      outcome: latest.length > 0 ? 'messages_found' : 'no_messages',
      latestMessages: latest,
    };
  }

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
