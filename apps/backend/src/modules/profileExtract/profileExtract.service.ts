/**
 * One-photo profile — extract structured profile fields from a snap.
 *
 * Why this matters:
 *   A non-trivial slice of seekers (low-literacy, older workers,
 *   workers without smartphones until recently) abandon signup at the
 *   profile-completion forms. Snapping a photo of an old resume, an
 *   ID, or even a handwritten sheet should fill the same fields in
 *   30 seconds instead of 5 minutes.
 *
 * Provider pattern:
 *   Same shape as the OTP sender (verification/sms.ts) — a swappable
 *   provider interface so we can keep a mock during development and
 *   switch to the Anthropic Messages API in production without
 *   touching callers. Mock returns a deterministic stub so the mobile
 *   confirmation screen has real-looking content to render in dev.
 *
 * What we return:
 *   A loose, partial profile shape. EVERY field is optional because
 *   the photo might be a driver's license (name + DOB only) or a
 *   handwritten skill list. The mobile confirmation screen lets the
 *   seeker edit before saving, so a partial extraction is fine.
 */

import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface ExtractedWorkExperience {
  company: string;
  role: string;
  /** YYYY-MM. */
  startDate: string;
  /** YYYY-MM. Null when current === true. */
  endDate?: string | null;
  current: boolean;
  description?: string | null;
}

export interface ExtractedEducation {
  degree: string;
  institution: string;
  fieldOfStudy?: string | null;
  startYear: number;
  endYear?: number | null;
  current: boolean;
}

export interface ExtractedProfile {
  name?: string | null;
  bio?: string | null;
  skills?: string[];
  experienceYears?: number | null;
  workHistory?: ExtractedWorkExperience[];
  education?: ExtractedEducation[];
  location?: { city?: string | null; area?: string | null };
  /** Free-text the model wanted to surface (rare). */
  notes?: string | null;
  /** Coarse self-assessed reliability of this extraction. */
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionInput {
  /** data:image/jpeg;base64,... — capped on the route. */
  imageDataUrl: string;
  /** Optional locale hint ('en' / 'hi' / 'ta' / 'te' / 'kn'). */
  locale?: string;
}

interface ExtractionProvider {
  extract(input: ExtractionInput): Promise<ExtractedProfile>;
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a small, plausible fixture so the mobile flow is end-to-end
// testable without an API key. Deliberately marks confidence:'low' so
// dev sees the "review before saving" UX kicked in.

class MockExtractionProvider implements ExtractionProvider {
  async extract(input: ExtractionInput): Promise<ExtractedProfile> {
    logger.info(
      { imageBytes: input.imageDataUrl.length, locale: input.locale ?? 'en' },
      'profileExtract: using mock provider',
    );
    return {
      name: 'Priya Sharma',
      bio: 'Experienced cook helper looking for restaurant work in Bengaluru.',
      skills: ['kitchen_helper', 'food_prep', 'customer_service'],
      experienceYears: 3,
      workHistory: [
        {
          company: 'Hotel Royal',
          role: 'Cook helper',
          startDate: '2022-04',
          endDate: '2024-06',
          current: false,
          description: 'Prep cook, dish wash, station setup for breakfast shift.',
        },
        {
          company: 'Sai Caterers',
          role: 'Banquet helper',
          startDate: '2024-07',
          endDate: null,
          current: true,
          description: null,
        },
      ],
      education: [
        {
          degree: '10th class',
          institution: 'Govt. High School, KPHB',
          fieldOfStudy: null,
          startYear: 2014,
          endYear: 2016,
          current: false,
        },
      ],
      location: { city: 'Bengaluru', area: 'Indiranagar' },
      notes: 'Mock extraction — set PROFILE_EXTRACT_PROVIDER=anthropic in production.',
      confidence: 'low',
    };
  }
}

// ─── Anthropic provider ────────────────────────────────────────────────────
// Posts the image to the Anthropic Messages API with a strict JSON-only
// system prompt. We parse the model's reply and validate it before
// returning so a hallucinated field never reaches the mobile screen.

const SYSTEM_PROMPT = `You are a precise profile-extraction assistant for Doondo, a blue-collar hiring app for India.

The user uploaded a photo of a personal document — it may be a typed resume, a handwritten work-history sheet, an ID card, a certificate, or a printout from another hiring platform. Your job is to extract structured profile fields from the image.

Rules:
- Output a SINGLE JSON object. Do not wrap it in markdown fences. Do not include any commentary before or after.
- The shape MUST be: { "name": string|null, "bio": string|null, "skills": string[], "experienceYears": number|null, "workHistory": [{ "company": string, "role": string, "startDate": "YYYY-MM", "endDate": "YYYY-MM"|null, "current": boolean, "description": string|null }], "education": [{ "degree": string, "institution": string, "fieldOfStudy": string|null, "startYear": number, "endYear": number|null, "current": boolean }], "location": { "city": string|null, "area": string|null }, "notes": string|null, "confidence": "high"|"medium"|"low" }.
- If a field is not visible in the image, return null (or empty array). Do NOT invent values. Especially do not invent skills or work history.
- For skills, normalise to lowercase snake_case slugs. Common Indian blue-collar slugs: kitchen_helper, food_prep, customer_service, delivery, driver_light, electrician, mason, carpenter, helper, security_guard, salon, cashier, shop_assistant, warehouse, cleaner, plumber, painter, welder, tailor, mehndi, baker, mechanic, AC_repair.
- Dates as "YYYY-MM" only. If only a year is visible, set it to "YYYY-01" and lower confidence.
- Set "confidence": "high" only if the image is clear AND most fields were directly readable. Otherwise "medium" or "low".
- Handwritten content is acceptable — extract what you can read confidently and skip the rest.
- Hindi/Tamil/Telugu/Kannada/Bengali script is acceptable — extract names verbatim in their original script, but translate trade words to the English slugs in the skills list.
- If the photo is not a personal document at all (e.g. it's a landscape, a meme, a screenshot of unrelated content), return { ...allEmpty, "confidence": "low", "notes": "Image does not appear to be a resume or ID document." }.`;

class AnthropicExtractionProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async extract(input: ExtractionInput): Promise<ExtractedProfile> {
    // Strip the data URL prefix to get the raw base64 + media type.
    const match = input.imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
      throw errors.validation(
        { imageDataUrl: 'malformed' },
        'Image must be a base64 data URL.',
      );
    }
    const mediaType = match[1]!;
    const base64 = match[2]!;

    const body = {
      model: this.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text' as const,
              text:
                'Extract the seeker profile from this image. Return JSON only.' +
                (input.locale ? ` UI locale: ${input.locale}.` : ''),
            },
          ],
        },
      ],
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 500) },
        'anthropic vision call failed',
      );
      if (res.status === 429) {
        throw errors.rateLimited('Vision provider rate-limited. Try again in a minute.');
      }
      throw new Error(`Vision extraction failed (${res.status})`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content?.find((c) => c.type === 'text');
    const raw = textBlock?.text?.trim() ?? '';

    // The system prompt asks for raw JSON but be defensive: strip
    // accidental markdown fences if the model wraps the response.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 500) }, 'vision response was not JSON');
      throw errors.internal('Could not read your photo. Try a clearer image.');
    }

    return normalizeExtraction(parsed);
  }
}

// ─── Normalisation / defensive parsing ─────────────────────────────────────

/**
 * Pull a partial profile out of whatever the model returned. Each field
 * is wrapped in a try/catch-style check so a single malformed entry
 * doesn't drop the whole extraction.
 */
function normalizeExtraction(raw: unknown): ExtractedProfile {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const result: ExtractedProfile = {
    name: pickString(obj.name),
    bio: pickString(obj.bio),
    skills: Array.isArray(obj.skills)
      ? obj.skills
          .filter((s) => typeof s === 'string')
          .map((s) => (s as string).trim().toLowerCase().slice(0, 40))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    experienceYears: pickInt(obj.experienceYears, 0, 60),
    workHistory: Array.isArray(obj.workHistory)
      ? obj.workHistory
          .map(normalizeWorkExperience)
          .filter((w): w is ExtractedWorkExperience => w !== null)
          .slice(0, 5)
      : [],
    education: Array.isArray(obj.education)
      ? obj.education
          .map(normalizeEducation)
          .filter((e): e is ExtractedEducation => e !== null)
          .slice(0, 6)
      : [],
    location: normalizeLocation(obj.location),
    notes: pickString(obj.notes),
    confidence:
      obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low'
        ? (obj.confidence as 'high' | 'medium' | 'low')
        : 'low',
  };
  return result;
}

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

function pickInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < min || n > max) return null;
  return n;
}

function pickYearMonth(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(v) ? v : null;
}

function normalizeWorkExperience(raw: unknown): ExtractedWorkExperience | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const company = pickString(r.company);
  const role = pickString(r.role);
  const startDate = pickYearMonth(r.startDate);
  if (!company || !role || !startDate) return null;
  const current = r.current === true;
  const endDate = current ? null : pickYearMonth(r.endDate);
  if (!current && !endDate) return null;
  return {
    company: company.slice(0, 120),
    role: role.slice(0, 120),
    startDate,
    endDate,
    current,
    description: pickString(r.description),
  };
}

function normalizeEducation(raw: unknown): ExtractedEducation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const degree = pickString(r.degree);
  const institution = pickString(r.institution);
  const startYear = pickInt(r.startYear, 1950, 2100);
  if (!degree || !institution || startYear === null) return null;
  const current = r.current === true;
  const endYear = current ? null : pickInt(r.endYear, 1950, 2100);
  if (!current && endYear === null) return null;
  return {
    degree: degree.slice(0, 120),
    institution: institution.slice(0, 200),
    fieldOfStudy: pickString(r.fieldOfStudy),
    startYear,
    endYear,
    current,
  };
}

function normalizeLocation(raw: unknown): { city?: string | null; area?: string | null } {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    city: pickString(r.city),
    area: pickString(r.area),
  };
}

// ─── Provider picker ───────────────────────────────────────────────────────

let cachedProvider: ExtractionProvider | null = null;

function pickProvider(): ExtractionProvider {
  if (cachedProvider) return cachedProvider;
  if (env.PROFILE_EXTRACT_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        'PROFILE_EXTRACT_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.',
      );
    }
    cachedProvider = new AnthropicExtractionProvider(
      env.ANTHROPIC_API_KEY,
      env.ANTHROPIC_VISION_MODEL,
    );
  } else {
    cachedProvider = new MockExtractionProvider();
  }
  return cachedProvider;
}

/**
 * Public entry — call from the controller. Throws AppError on
 * configuration or provider failures.
 */
export async function extractProfileFromPhoto(
  input: ExtractionInput,
): Promise<ExtractedProfile> {
  return pickProvider().extract(input);
}

/** Test helper for the eventual unit tests. */
export function __setProviderForTests(provider: ExtractionProvider | null): void {
  cachedProvider = provider;
}
