/**
 * Document extraction — read an uploaded skill-proof file (a certificate,
 * licence, or training document) and pull out the human-meaningful bits:
 * what the document is, who issued it, and when.
 *
 * Why this matters:
 *   A worker attaches a file as proof of a skill. Without this, an
 *   employer just sees `skill-photo-1718…​.jpg`. With it, they see
 *   "ITI Electrician Certificate · Govt ITI · 2019" — scannable, and a
 *   real trust signal. It also auto-names the file for a low-literacy
 *   worker who would never type a label themselves.
 *
 * Provider pattern:
 *   Same shape as profileExtract.service — a swappable provider so a
 *   fresh checkout works with no API key (the `mock` provider returns a
 *   plausible stub) and a production deploy flips DOCUMENT_EXTRACT_
 *   PROVIDER to `anthropic`. Callers never see the difference, and the
 *   chat/upload path treats extraction as best-effort.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface DocumentExtraction {
  /** What the document is, e.g. "ITI Electrician Certificate". */
  title: string | null;
  /** Who issued it, e.g. "Govt ITI, Bengaluru". */
  issuer: string | null;
  /** Free-text issue date as printed, e.g. "2019" or "Mar 2021". */
  issuedOn: string | null;
  /** Coarse self-assessed reliability of this read. */
  confidence: 'high' | 'medium' | 'low';
}

export interface DocumentExtractionInput {
  /** The file as a base64 data URL. */
  dataUrl: string;
  /** MIME type — `image/*` or `application/pdf`. */
  mimeType: string;
  /** The skill the worker tagged this file to — a hint for the model. */
  skill: string;
}

interface DocumentExtractionProvider {
  extract(input: DocumentExtractionInput): Promise<DocumentExtraction>;
}

/** "kitchen_helper" → "Kitchen helper" for a readable fallback title. */
function humanizeSkill(slug: string): string {
  const s = slug.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Skill';
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a plausible, skill-derived stub so the upload → read → display
// flow is testable on a fresh checkout. Marked confidence:'low' so dev
// sees the un-verified treatment. Production sets the anthropic provider.

class MockDocumentExtractionProvider implements DocumentExtractionProvider {
  async extract(input: DocumentExtractionInput): Promise<DocumentExtraction> {
    logger.info(
      { skill: input.skill, mimeType: input.mimeType },
      'documentExtract: using mock provider',
    );
    return {
      title: `${humanizeSkill(input.skill)} certificate`,
      issuer: null,
      issuedOn: null,
      confidence: 'low',
    };
  }
}

// ─── Anthropic provider ─────────────────────────────────────────────────────
// Posts the file to the Anthropic Messages API with a strict JSON-only
// prompt. Images go as an `image` block, PDFs as a `document` block.

const SYSTEM_PROMPT = `You read a single uploaded document for Doondo, a blue-collar hiring app in India. The document is a worker's proof of a skill — typically a training certificate, a trade licence, a course completion, a mark sheet, or a photo of one.

Extract three things and output a SINGLE JSON object — no markdown fences, no commentary:
{ "title": string|null, "issuer": string|null, "issuedOn": string|null, "confidence": "high"|"medium"|"low" }

Rules:
- "title": what the document IS, short and plain — e.g. "ITI Electrician Certificate", "Light Motor Vehicle Licence", "Food Safety Training". Null if you cannot tell.
- "issuer": the organisation that issued it — e.g. "Govt ITI, Bengaluru", "RTO Karnataka". Null if not visible.
- "issuedOn": the issue date EXACTLY as printed (a year alone is fine). Null if not visible.
- Do NOT invent anything. If the image is blurry, a non-document, or unreadable, return all-null with "confidence": "low".
- Indian-language text (Hindi/Tamil/Telugu/Kannada) is fine — translate the title to English, keep names/issuers in their original script.
- "confidence": "high" only when the document is clearly a credential AND the title was directly readable.`;

class AnthropicDocumentExtractionProvider implements DocumentExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async extract(input: DocumentExtractionInput): Promise<DocumentExtraction> {
    const match = input.dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) {
      throw new Error('Document is not a base64 data URL.');
    }
    const mediaType = (input.mimeType || match[1]!).toLowerCase();
    const base64 = match[2]!;
    const isPdf = mediaType.includes('pdf');

    const fileBlock = isPdf
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf',
            data: base64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType,
            data: base64,
          },
        };

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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user' as const,
            content: [
              fileBlock,
              {
                type: 'text' as const,
                text: `This document is the worker's proof for the skill "${input.skill}". Return JSON only.`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'anthropic document extraction failed',
      );
      throw new Error(`Document extraction failed (${res.status})`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = json.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'document extraction was not JSON');
      throw new Error('Document extraction response was not valid JSON');
    }

    const pick = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;

    return {
      title: pick(parsed.title),
      issuer: pick(parsed.issuer),
      issuedOn: pick(parsed.issuedOn),
      confidence:
        parsed.confidence === 'high' ||
        parsed.confidence === 'medium' ||
        parsed.confidence === 'low'
          ? parsed.confidence
          : 'low',
    };
  }
}

// ─── Provider picker ───────────────────────────────────────────────────────

let cachedProvider: DocumentExtractionProvider | null = null;

function pickProvider(): DocumentExtractionProvider {
  if (cachedProvider) return cachedProvider;
  if (env.DOCUMENT_EXTRACT_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        'DOCUMENT_EXTRACT_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.',
      );
    }
    cachedProvider = new AnthropicDocumentExtractionProvider(
      env.ANTHROPIC_API_KEY,
      env.ANTHROPIC_VISION_MODEL,
    );
  } else {
    cachedProvider = new MockDocumentExtractionProvider();
  }
  return cachedProvider;
}

/**
 * Read an uploaded skill-proof document. Throws on a configuration or
 * provider failure — callers (the upload path) treat extraction as
 * best-effort and swallow the error so a failed read never blocks the
 * upload itself.
 */
export async function extractDocument(
  input: DocumentExtractionInput,
): Promise<DocumentExtraction> {
  return pickProvider().extract(input);
}

/** Test helper — swap in a fake provider. */
export function __setProviderForTests(
  provider: DocumentExtractionProvider | null,
): void {
  cachedProvider = provider;
}
