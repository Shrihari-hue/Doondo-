/**
 * Rejection explainer — the "Why was I rejected?" one-paragraph writeup.
 *
 * Skill-gap surfacing (skillGap.service.ts) already computes WHAT was
 * missing and WHICH course closes it. This module turns that into a
 * short, plain-language, encouraging paragraph — the moment a rejection
 * lands is discouraging, and a templated "missing: X" list reads like a
 * rejection letter twice. A human-sounding paragraph reframes it as a
 * next step.
 *
 * Provider pattern: same shape as resumeRewrite/translation — a
 * swappable provider. `mock` is a genuinely useful templated paragraph
 * (no API needed), `anthropic`/`openai` write a natural one. Flip with
 * REJECTION_EXPLAINER_PROVIDER.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface ExplainerInput {
  jobTitle: string;
  missingSkills: string[];
  recommendedCourseTitle: string | null;
}

export interface ExplainerResult {
  /** One short, plain-language paragraph. */
  paragraph: string;
  provider: 'anthropic' | 'openai' | 'mock';
}

interface ExplainerProvider {
  explain(input: ExplainerInput): Promise<ExplainerResult>;
}

/** "kitchen_helper" -> "kitchen helper". */
function humanize(slug: string): string {
  return slug.replace(/_/g, ' ').trim();
}

function joinSkills(skills: string[]): string {
  const humanized = skills.map(humanize);
  if (humanized.length === 0) return '';
  if (humanized.length === 1) return humanized[0]!;
  if (humanized.length === 2) return `${humanized[0]} and ${humanized[1]}`;
  return `${humanized.slice(0, -1).join(', ')}, and ${humanized[humanized.length - 1]}`;
}

// ─── Mock provider ──────────────────────────────────────────────────────────

class MockExplainerProvider implements ExplainerProvider {
  async explain(input: ExplainerInput): Promise<ExplainerResult> {
    const skillPhrase = joinSkills(input.missingSkills);
    const coursePart = input.recommendedCourseTitle
      ? ` "${input.recommendedCourseTitle}" is a short course that covers this — worth a look before your next application.`
      : ' Keep applying — not every employer weighs the same skills the same way.';

    const paragraph = skillPhrase
      ? `This employer was looking for ${skillPhrase}, which isn't on your profile yet. That's the most likely reason this one didn't move forward — it's not a reflection of your experience overall.${coursePart}`
      : `This employer didn't share a specific reason, and your profile already covers everything this job asked for. Sometimes it comes down to timing or how many people applied — it's worth trying again with a similar job.`;

    logger.info(
      { jobTitle: input.jobTitle, missingCount: input.missingSkills.length },
      'rejectionExplainer: using mock provider',
    );

    return { paragraph, provider: 'mock' };
  }
}

// ─── Anthropic provider ─────────────────────────────────────────────────────

class AnthropicExplainerProvider implements ExplainerProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async explain(input: ExplainerInput): Promise<ExplainerResult> {
    const system = `You write short, kind explanations for Doondo, a blue-collar hiring app in India. A worker's job application was rejected. Explain why in ONE short, plain-language paragraph (3-4 sentences max) that is honest but encouraging — never blame the worker, frame the missing skill as a next step, not a failure.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary.
- Shape MUST be: { "paragraph": string }.
- Plain language, short sentences, no jargon. The reader may have limited English literacy.
- NEVER invent reasons not given in the input. If there's a recommended course, mention it naturally as a next step.`;

    const userContent = JSON.stringify({
      jobTitle: input.jobTitle,
      missingSkills: input.missingSkills,
      recommendedCourseTitle: input.recommendedCourseTitle,
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
        max_tokens: 512,
        system,
        messages: [{ role: 'user' as const, content: userContent }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'anthropic rejection-explainer call failed',
      );
      throw new Error(`Rejection explainer failed (${res.status})`);
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: { paragraph?: unknown };
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'rejection-explainer response was not JSON');
      throw new Error('Rejection explainer response was not valid JSON');
    }

    return {
      paragraph:
        typeof parsed.paragraph === 'string' && parsed.paragraph.trim()
          ? parsed.paragraph.trim()
          : `This job asked for ${joinSkills(input.missingSkills)}, which isn't on your profile yet.`,
      provider: 'anthropic',
    };
  }
}

// ─── OpenAI provider ────────────────────────────────────────────────────────

class OpenAiExplainerProvider implements ExplainerProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async explain(input: ExplainerInput): Promise<ExplainerResult> {
    const system = `You write short, kind explanations for Doondo, a blue-collar hiring app in India. A worker's job application was rejected. Explain why in ONE short, plain-language paragraph (3-4 sentences max) that is honest but encouraging — never blame the worker, frame the missing skill as a next step, not a failure.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary.
- Shape MUST be: { "paragraph": string }.
- Plain language, short sentences, no jargon. The reader may have limited English literacy.
- NEVER invent reasons not given in the input. If there's a recommended course, mention it naturally as a next step.`;

    const userContent = JSON.stringify({
      jobTitle: input.jobTitle,
      missingSkills: input.missingSkills,
      recommendedCourseTitle: input.recommendedCourseTitle,
    });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: 512,
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
        'openai rejection-explainer call failed',
      );
      throw new Error(`Rejection explainer failed (${res.status})`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: { paragraph?: unknown };
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'rejection-explainer response was not JSON');
      throw new Error('Rejection explainer response was not valid JSON');
    }

    return {
      paragraph:
        typeof parsed.paragraph === 'string' && parsed.paragraph.trim()
          ? parsed.paragraph.trim()
          : `This job asked for ${joinSkills(input.missingSkills)}, which isn't on your profile yet.`,
      provider: 'openai',
    };
  }
}

// ─── Provider picker ────────────────────────────────────────────────────────

let cachedProvider: ExplainerProvider | null = null;

function pickProvider(): ExplainerProvider {
  if (cachedProvider) return cachedProvider;
  if (env.REJECTION_EXPLAINER_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('REJECTION_EXPLAINER_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.');
    }
    cachedProvider = new AnthropicExplainerProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_TEXT_MODEL);
  } else if (env.REJECTION_EXPLAINER_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('REJECTION_EXPLAINER_PROVIDER=openai but OPENAI_API_KEY is not set.');
    }
    cachedProvider = new OpenAiExplainerProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  } else {
    cachedProvider = new MockExplainerProvider();
  }
  return cachedProvider;
}

export async function explainRejection(input: ExplainerInput): Promise<ExplainerResult> {
  return pickProvider().explain(input);
}

/** Test helper — swap in a fake provider. */
export function __setExplainerProviderForTests(provider: ExplainerProvider | null): void {
  cachedProvider = provider;
}
