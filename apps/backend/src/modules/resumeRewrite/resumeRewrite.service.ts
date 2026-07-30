/**
 * Smart Resume — rewrite a worker's resume to target one specific job.
 *
 * Why this matters:
 *   The same worker is a different candidate for different jobs. For a
 *   kitchen job their catering shifts matter; for a delivery job their
 *   two-wheeler licence matters. Most blue-collar workers will never
 *   re-tailor a resume by hand. Smart Resume does it for them: tap a
 *   job, get a version of your own history re-ordered and re-worded to
 *   speak to that job — which they review before it goes anywhere.
 *
 * Provider pattern:
 *   Same shape as translation / transcription / profileExtract — a
 *   swappable provider. The `mock` provider is genuinely functional
 *   (skill-overlap ranking + a templated summary are pure logic, no API
 *   needed) so a fresh checkout produces a real, useful tailored draft;
 *   `anthropic` produces a polished natural-language rewrite. Flip with
 *   RESUME_REWRITE_PROVIDER.
 *
 * Nothing here is persisted. The rewrite is computed on demand and the
 * worker decides what to do with it — the dignifying default is that the
 * worker reviews and approves, never a silent background mutation.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { tailoredResumes } from '@/db/schema';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserModel } from '@/modules/users/user.model';
import { JobModel } from '@/modules/jobs/job.model';

// ─── Wire shapes ────────────────────────────────────────────────────────────

export interface ResumeProfileInput {
  name: string;
  bio: string | null;
  skills: string[];
  experienceYears: number | null;
  workHistory: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string | null;
    current: boolean;
    description: string | null;
  }>;
  education: Array<{ degree: string; institution: string }>;
}

export interface ResumeJobInput {
  title: string;
  description: string;
  skills: string[];
}

export interface ResumeRewriteInput {
  profile: ResumeProfileInput;
  job: ResumeJobInput;
}

/** One re-worded work-history line, tuned to the target job. */
export interface TailoredWorkBlurb {
  company: string;
  role: string;
  /** A single, job-tuned sentence describing this role. */
  blurb: string;
}

export interface TailoredResume {
  /** The job this resume was tailored for — echoed for the UI header. */
  jobTitle: string;
  /** A 2-3 sentence summary tuned to the target job. */
  summary: string;
  /** The worker's skills, re-ordered most-relevant-to-this-job first. */
  highlightedSkills: string[];
  /** Which of the job's required skills the worker already has. */
  matchedSkills: string[];
  /**
   * Job-required skills the worker does NOT yet have — drives the
   * "build this skill" course nudge on the Smart Resume screen.
   */
  missingSkills: string[];
  /** Job-tuned one-liners, one per work-history entry. */
  workBlurbs: TailoredWorkBlurb[];
  /** A short, encouraging note on why this worker fits — shown to them. */
  pitch: string;
  /** Which provider produced this. */
  provider: 'anthropic' | 'openai' | 'mock';
}

interface ResumeRewriteProvider {
  rewrite(input: ResumeRewriteInput): Promise<TailoredResume>;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Human-readable skill: "kitchen_helper" → "kitchen helper". */
function humanizeSkill(slug: string): string {
  return slug.replace(/_/g, ' ').trim();
}

/**
 * Re-rank the worker's skills so the ones this job asks for come first
 * (in the job's own order), followed by the rest in their original
 * order. Pure logic — shared by both providers.
 */
function rankSkills(
  profileSkills: string[],
  jobSkills: string[],
): { ordered: string[]; matched: string[]; missing: string[] } {
  const have = new Set(profileSkills.map((s) => s.toLowerCase()));
  const matched = jobSkills.filter((s) => have.has(s.toLowerCase()));
  const missing = jobSkills.filter((s) => !have.has(s.toLowerCase()));
  const matchedSet = new Set(matched.map((s) => s.toLowerCase()));
  const rest = profileSkills.filter((s) => !matchedSet.has(s.toLowerCase()));
  return { ordered: [...matched, ...rest], matched, missing };
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Fully functional: the skill ranking is real, and the summary / blurbs
// are deterministic templates. A fresh checkout gets a genuinely useful
// tailored draft. Production flips to `anthropic` for a natural rewrite.

class MockResumeRewriteProvider implements ResumeRewriteProvider {
  async rewrite(input: ResumeRewriteInput): Promise<TailoredResume> {
    const { profile, job } = input;
    const { ordered, matched, missing } = rankSkills(profile.skills, job.skills);

    const years =
      profile.experienceYears && profile.experienceYears > 0
        ? `${profile.experienceYears}-year`
        : 'hands-on';
    const topSkills = ordered.slice(0, 3).map(humanizeSkill);
    const skillPhrase =
      topSkills.length > 0 ? topSkills.join(', ') : 'reliable general work';

    const summary =
      `${profile.name} is a ${years} worker applying for the ${job.title} role. ` +
      `Strengths most relevant here: ${skillPhrase}. ` +
      (profile.workHistory[0]
        ? `Most recently worked as ${profile.workHistory[0].role} at ${profile.workHistory[0].company}.`
        : 'Ready to start and eager to learn on the job.');

    const workBlurbs: TailoredWorkBlurb[] = profile.workHistory.map((w) => ({
      company: w.company,
      role: w.role,
      blurb:
        (w.description && w.description.trim()) ||
        `Worked as ${w.role} at ${w.company} — experience that carries over to a ${job.title} role.`,
    }));

    const pitch =
      matched.length > 0
        ? `You already have ${matched.length} of the ${job.skills.length || matched.length} skills this job asks for: ${matched
            .map(humanizeSkill)
            .join(', ')}. Lead with those.`
        : `This job lists skills you haven't tagged yet — highlight your closest experience and willingness to learn.`;

    logger.info(
      { jobTitle: job.title, matched: matched.length },
      'resumeRewrite: using mock provider',
    );

    return {
      jobTitle: job.title,
      summary,
      highlightedSkills: ordered,
      matchedSkills: matched,
      missingSkills: missing,
      workBlurbs,
      pitch,
      provider: 'mock',
    };
  }
}

// ─── Anthropic provider ─────────────────────────────────────────────────────
// Sends the worker's profile + the job to the Anthropic Messages API
// with a strict JSON-only prompt. The skill ranking is still computed
// locally (deterministic, cheaper, and a guaranteed-correct fallback) —
// the model only writes the natural-language summary, blurbs and pitch.

class AnthropicResumeRewriteProvider implements ResumeRewriteProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async rewrite(input: ResumeRewriteInput): Promise<TailoredResume> {
    const { profile, job } = input;
    const { ordered, matched, missing } = rankSkills(profile.skills, job.skills);

    const system = `You are a resume-tailoring assistant for Doondo, a blue-collar hiring app in India. Rewrite a worker's resume so it speaks directly to ONE specific job. The worker is often low-literacy — keep every sentence short, plain, and honest.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary.
- Shape MUST be: { "summary": string, "workBlurbs": [{ "company": string, "role": string, "blurb": string }], "pitch": string }.
- "summary": 2-3 short sentences introducing the worker for THIS job. Mention real, relevant strengths only.
- "workBlurbs": one entry per work-history item given, in the same order. "blurb" is ONE short sentence re-framing that job toward the target role. Keep company and role exactly as given.
- "pitch": one short, encouraging sentence telling the worker why they fit and what to lead with.
- NEVER invent experience, skills, certifications, or employers. Use only what is provided. If the worker has little experience, be honest and emphasise reliability and willingness.`;

    const userContent = JSON.stringify({
      targetJob: {
        title: job.title,
        description: job.description.slice(0, 1500),
        requiredSkills: job.skills,
      },
      worker: {
        name: profile.name,
        bio: profile.bio,
        skills: profile.skills,
        experienceYears: profile.experienceYears,
        workHistory: profile.workHistory,
        education: profile.education,
      },
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1536,
        system,
        messages: [{ role: 'user' as const, content: userContent }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'anthropic resume-rewrite call failed',
      );
      throw new Error(`Resume rewrite failed (${res.status})`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = json.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: {
      summary?: unknown;
      workBlurbs?: unknown;
      pitch?: unknown;
    };
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'resume-rewrite response was not JSON');
      throw new Error('Resume rewrite response was not valid JSON');
    }

    // Map blurbs back, falling back to the worker's own description so a
    // missing entry never blanks a job out.
    const blurbsByKey = new Map<string, string>();
    if (Array.isArray(parsed.workBlurbs)) {
      for (const b of parsed.workBlurbs) {
        if (b && typeof b === 'object') {
          const r = b as Record<string, unknown>;
          if (
            typeof r.company === 'string' &&
            typeof r.role === 'string' &&
            typeof r.blurb === 'string'
          ) {
            blurbsByKey.set(`${r.company}::${r.role}`, r.blurb.trim());
          }
        }
      }
    }
    const workBlurbs: TailoredWorkBlurb[] = profile.workHistory.map((w) => ({
      company: w.company,
      role: w.role,
      blurb:
        blurbsByKey.get(`${w.company}::${w.role}`) ||
        (w.description && w.description.trim()) ||
        `${w.role} at ${w.company}.`,
    }));

    return {
      jobTitle: job.title,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : `${profile.name} — applying for the ${job.title} role.`,
      highlightedSkills: ordered,
      matchedSkills: matched,
      missingSkills: missing,
      workBlurbs,
      pitch:
        typeof parsed.pitch === 'string' && parsed.pitch.trim()
          ? parsed.pitch.trim()
          : 'Lead with the experience closest to this job.',
      provider: 'anthropic',
    };
  }
}

// ─── OpenAI provider ────────────────────────────────────────────────────────
// Same contract as the Anthropic provider — locally-computed skill ranking,
// model writes only the natural-language summary / blurbs / pitch — but via
// OpenAI's chat-completions API, reusing the OPENAI_API_KEY the deploy
// already has for transcription. Uses `max_completion_tokens` (the gpt-5 /
// o-series parameter) and JSON response mode.

class OpenAiResumeRewriteProvider implements ResumeRewriteProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async rewrite(input: ResumeRewriteInput): Promise<TailoredResume> {
    const { profile, job } = input;
    const { ordered, matched, missing } = rankSkills(profile.skills, job.skills);

    const system = `You are a resume-tailoring assistant for Doondo, a blue-collar hiring app in India. Rewrite a worker's resume so it speaks directly to ONE specific job. The worker is often low-literacy — keep every sentence short, plain, and honest.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary.
- Shape MUST be: { "summary": string, "workBlurbs": [{ "company": string, "role": string, "blurb": string }], "pitch": string }.
- "summary": 2-3 short sentences introducing the worker for THIS job. Mention real, relevant strengths only.
- "workBlurbs": one entry per work-history item given, in the same order. "blurb" is ONE short sentence re-framing that job toward the target role. Keep company and role exactly as given.
- "pitch": one short, encouraging sentence telling the worker why they fit and what to lead with.
- NEVER invent experience, skills, certifications, or employers. Use only what is provided. If the worker has little experience, be honest and emphasise reliability and willingness.`;

    const userContent = JSON.stringify({
      targetJob: {
        title: job.title,
        description: job.description.slice(0, 1500),
        requiredSkills: job.skills,
      },
      worker: {
        name: profile.name,
        bio: profile.bio,
        skills: profile.skills,
        experienceYears: profile.experienceYears,
        workHistory: profile.workHistory,
        education: profile.education,
      },
    });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: 1536,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system' as const, content: system },
          { role: 'user' as const, content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'openai resume-rewrite call failed',
      );
      throw new Error(`Resume rewrite failed (${res.status})`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: { summary?: unknown; workBlurbs?: unknown; pitch?: unknown };
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'resume-rewrite response was not JSON');
      throw new Error('Resume rewrite response was not valid JSON');
    }

    const blurbsByKey = new Map<string, string>();
    if (Array.isArray(parsed.workBlurbs)) {
      for (const b of parsed.workBlurbs) {
        if (b && typeof b === 'object') {
          const r = b as Record<string, unknown>;
          if (
            typeof r.company === 'string' &&
            typeof r.role === 'string' &&
            typeof r.blurb === 'string'
          ) {
            blurbsByKey.set(`${r.company}::${r.role}`, r.blurb.trim());
          }
        }
      }
    }
    const workBlurbs: TailoredWorkBlurb[] = profile.workHistory.map((w) => ({
      company: w.company,
      role: w.role,
      blurb:
        blurbsByKey.get(`${w.company}::${w.role}`) ||
        (w.description && w.description.trim()) ||
        `${w.role} at ${w.company}.`,
    }));

    return {
      jobTitle: job.title,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : `${profile.name} — applying for the ${job.title} role.`,
      highlightedSkills: ordered,
      matchedSkills: matched,
      missingSkills: missing,
      workBlurbs,
      pitch:
        typeof parsed.pitch === 'string' && parsed.pitch.trim()
          ? parsed.pitch.trim()
          : 'Lead with the experience closest to this job.',
      provider: 'openai',
    };
  }
}

// ─── Provider picker ───────────────────────────────────────────────────────

let cachedProvider: ResumeRewriteProvider | null = null;

function pickProvider(): ResumeRewriteProvider {
  if (cachedProvider) return cachedProvider;
  if (env.RESUME_REWRITE_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        'RESUME_REWRITE_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.',
      );
    }
    cachedProvider = new AnthropicResumeRewriteProvider(
      env.ANTHROPIC_API_KEY,
      env.ANTHROPIC_TEXT_MODEL,
    );
  } else if (env.RESUME_REWRITE_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'RESUME_REWRITE_PROVIDER=openai but OPENAI_API_KEY is not set.',
      );
    }
    cachedProvider = new OpenAiResumeRewriteProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  } else {
    cachedProvider = new MockResumeRewriteProvider();
  }
  return cachedProvider;
}

/** Core rewrite — given an already-assembled profile + job. */
export async function rewriteResume(
  input: ResumeRewriteInput,
): Promise<TailoredResume> {
  return pickProvider().rewrite(input);
}

export interface TailorResumeResult {
  resume: TailoredResume;
  /** True when this is the worker's previously-reviewed saved version. */
  saved: boolean;
}

/**
 * High-level entry for the route. If the worker already reviewed and
 * saved a resume for this job, return that (instant, shows their edits).
 * Otherwise load their profile + the job and generate a fresh tailored
 * resume.
 *
 * Throws `notFound` when the user or job doesn't exist.
 */
export async function tailorResumeForJob(
  userId: string,
  jobId: string,
): Promise<TailorResumeResult> {
  const [user, job] = await Promise.all([
    UserModel.findById(userId),
    JobModel.findById(jobId),
  ]);
  if (!user) throw errors.notFound('User not found.');
  if (!job) throw errors.notFound('Job not found.');

  const jobSkills = job.skills ?? [];

  // Reopening Smart Resume for the same job returns the worker's saved,
  // reviewed version — never a surprise re-generation over their edits.
  const saved = await getSavedTailoredResume(userId, jobId);
  if (saved) {
    const matchedSet = new Set(saved.matchedSkills.map((s) => s.toLowerCase()));
    return {
      resume: {
        jobTitle: job.title,
        summary: saved.summary,
        pitch: saved.pitch,
        highlightedSkills: saved.highlightedSkills,
        matchedSkills: saved.matchedSkills,
        missingSkills: jobSkills.filter(
          (s) => !matchedSet.has(s.toLowerCase()),
        ),
        workBlurbs: saved.workBlurbs,
        provider:
          saved.provider === 'anthropic' || saved.provider === 'openai'
            ? saved.provider
            : 'mock',
      },
      saved: true,
    };
  }

  const profile: ResumeProfileInput = {
    name: user.name,
    bio: user.bio ?? null,
    skills: user.skills ?? [],
    experienceYears: user.experienceYears ?? null,
    workHistory: (user.workHistory ?? []).map((w) => ({
      company: w.company,
      role: w.role,
      startDate: w.startDate,
      endDate: w.endDate ?? null,
      current: Boolean(w.current),
      description: w.description ?? null,
    })),
    education: (user.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
    })),
  };

  const resume = await rewriteResume({
    profile,
    job: {
      title: job.title,
      description: job.description,
      skills: jobSkills,
    },
  });
  return { resume, saved: false };
}

// ─── Persistence — the worker's reviewed resume, saved per job ──────────────

/** A tailored resume the worker has reviewed and saved for one job. */
export interface SavedTailoredResume {
  jobId: string;
  summary: string;
  pitch: string;
  highlightedSkills: string[];
  matchedSkills: string[];
  workBlurbs: TailoredWorkBlurb[];
  provider: string;
  updatedAt: string;
}

export interface SaveTailoredResumeInput {
  summary: string;
  pitch: string;
  highlightedSkills: string[];
  matchedSkills: string[];
  workBlurbs: TailoredWorkBlurb[];
  provider?: string;
}

function toSaved(doc: typeof tailoredResumes.$inferSelect): SavedTailoredResume {
  return {
    jobId: doc.jobId,
    summary: doc.summary,
    pitch: doc.pitch,
    highlightedSkills: doc.highlightedSkills,
    matchedSkills: doc.matchedSkills,
    workBlurbs: doc.workBlurbs.map((w) => ({
      company: w.company,
      role: w.role,
      blurb: w.blurb,
    })),
    provider: doc.provider,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The saved tailored resume for (seeker, job), or null if never saved. */
export async function getSavedTailoredResume(
  seekerId: string,
  jobId: string,
): Promise<SavedTailoredResume | null> {
  const [doc] = await getDb().select().from(tailoredResumes).where(and(eq(tailoredResumes.seekerId, seekerId), eq(tailoredResumes.jobId, jobId))).limit(1);
  return doc ? toSaved(doc) : null;
}

/** Upsert the worker's reviewed/edited tailored resume for one job. */
export async function saveTailoredResume(
  seekerId: string,
  jobId: string,
  input: SaveTailoredResumeInput,
): Promise<SavedTailoredResume> {
  const [doc] = await getDb().insert(tailoredResumes).values({ seekerId, jobId, summary: input.summary, pitch: input.pitch, highlightedSkills: input.highlightedSkills, matchedSkills: input.matchedSkills, workBlurbs: input.workBlurbs, provider: input.provider ?? 'mock' }).onConflictDoUpdate({ target: [tailoredResumes.seekerId, tailoredResumes.jobId], set: { summary: input.summary, pitch: input.pitch, highlightedSkills: input.highlightedSkills, matchedSkills: input.matchedSkills, workBlurbs: input.workBlurbs, provider: input.provider ?? 'mock', updatedAt: new Date() } }).returning();
  return toSaved(doc!);
}

/** Test helper — swap in a fake provider. */
export function __setProviderForTests(
  provider: ResumeRewriteProvider | null,
): void {
  cachedProvider = provider;
}
