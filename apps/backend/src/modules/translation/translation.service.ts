/**
 * In-chat translation — render a chat message in the reader's language.
 *
 * Why this matters:
 *   Doondo is a cross-region hiring app. A Tamil-speaking welder in
 *   Chennai and a Hindi-speaking site manager in Delhi should be able to
 *   talk in one thread without either of them switching languages. The
 *   sender writes in whatever language is natural; the recipient sees a
 *   translation under the bubble in their own language — the same shape
 *   as the voice-note transcript.
 *
 * Provider pattern:
 *   Same shape as transcription.service / profileExtract.service — a
 *   swappable provider so a fresh checkout works with no API key (the
 *   `mock` provider) and a production deploy flips TRANSLATION_PROVIDER
 *   to `anthropic` for real translations. Callers never see the
 *   difference.
 *
 * Translation is best-effort: the chat send path treats a failed
 * translation the same way it treats a failed transcript — it logs and
 * gives up, the message itself is already delivered.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export const TRANSLATABLE_LANGS = ['en', 'hi', 'ta', 'te', 'kn'] as const;
export type TranslatableLang = (typeof TRANSLATABLE_LANGS)[number];

/** Human-readable names — used in the Anthropic system prompt. */
const LANG_NAMES: Record<TranslatableLang, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
};

/** Runtime guard — narrows an unknown value to a supported language. */
export function isTranslatableLang(v: unknown): v is TranslatableLang {
  return (
    typeof v === 'string' &&
    (TRANSLATABLE_LANGS as readonly string[]).includes(v)
  );
}

/**
 * Cheap script-based language detection. The four Indian scripts Doondo
 * supports live in disjoint Unicode blocks, so a single character from
 * one of them is a reliable tell. Latin-only text is treated as English.
 *
 * This is intentionally simple — the Anthropic provider re-detects more
 * accurately, and for the mock it only needs to be good enough to decide
 * whether a translation is even needed.
 */
export function detectLang(text: string): TranslatableLang {
  if (/[ऀ-ॿ]/.test(text)) return 'hi'; // Devanagari
  if (/[஀-௿]/.test(text)) return 'ta'; // Tamil
  if (/[ఀ-౿]/.test(text)) return 'te'; // Telugu
  if (/[ಀ-೿]/.test(text)) return 'kn'; // Kannada
  return 'en';
}

export interface TranslationInput {
  text: string;
  targetLang: TranslatableLang;
  /** Optional caller hint; the provider may still re-detect. */
  sourceLangHint?: TranslatableLang;
}

export interface TranslationResult {
  /** The translated text. Equals the input when `skipped` is true. */
  text: string;
  /** Detected (or hinted) source language. */
  sourceLang: TranslatableLang;
  targetLang: TranslatableLang;
  /** True when source === target — nothing needed translating. */
  skipped: boolean;
  /** Which provider produced this — useful for logs / dev sanity. */
  provider: 'anthropic' | 'openai' | 'mock';
}

interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a deterministic, clearly-labelled preview so the chat UX — the
// socket event, the bubble rendering, the reader's language match — is
// fully end-to-end testable on a fresh checkout. It does NOT pretend to
// really translate: production deploys must set TRANSLATION_PROVIDER=
// anthropic. Mirrors the philosophy of the transcription mock.

const MOCK_PREVIEW: Record<TranslatableLang, string> = {
  en: '(Translation preview — set TRANSLATION_PROVIDER=anthropic for real translations.)',
  hi: '(अनुवाद पूर्वावलोकन — वास्तविक अनुवाद के लिए TRANSLATION_PROVIDER=anthropic सेट करें।)',
  ta: '(மொழிபெயர்ப்பு முன்னோட்டம் — உண்மையான மொழிபெயர்ப்புக்கு TRANSLATION_PROVIDER=anthropic.)',
  te: '(అనువాద ప్రివ్యూ — నిజమైన అనువాదాల కోసం TRANSLATION_PROVIDER=anthropic సెట్ చేయండి.)',
  kn: '(ಅನುವಾದ ಮುನ್ನೋಟ — ನಿಜವಾದ ಅನುವಾದಗಳಿಗಾಗಿ TRANSLATION_PROVIDER=anthropic.)',
};

class MockTranslationProvider implements TranslationProvider {
  async translate(input: TranslationInput): Promise<TranslationResult> {
    const sourceLang = input.sourceLangHint ?? detectLang(input.text);
    const skipped = sourceLang === input.targetLang;
    logger.info(
      { sourceLang, targetLang: input.targetLang, skipped },
      'translation: using mock provider',
    );
    return {
      text: skipped ? input.text : MOCK_PREVIEW[input.targetLang],
      sourceLang,
      targetLang: input.targetLang,
      skipped,
      provider: 'mock',
    };
  }
}

// ─── Anthropic provider ─────────────────────────────────────────────────────
// Posts the message to the Anthropic Messages API with a strict JSON-only
// translation prompt. We parse and validate the reply so a malformed
// response degrades to "no translation" rather than corrupting the chat.

class AnthropicTranslationProvider implements TranslationProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const targetName = LANG_NAMES[input.targetLang];
    const system = `You are a translation engine for Doondo, a blue-collar hiring chat app in India. Translate the user's chat message into ${targetName}.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary before or after.
- Shape MUST be: { "text": string, "sourceLang": "en"|"hi"|"ta"|"te"|"kn" }.
- "text" is the message translated naturally into ${targetName}. Keep it conversational and short — it is a chat message, not a document.
- "sourceLang" is the language the ORIGINAL message was written in.
- If the message is already in ${targetName}, return it unchanged with the correct sourceLang.
- Preserve names, phone numbers, addresses, job titles and money amounts exactly.
- Do not add, explain, or omit anything. Translate only what is there.`;

    const body = {
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user' as const, content: input.text }],
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
        { status: res.status, body: text.slice(0, 300) },
        'anthropic translation call failed',
      );
      throw new Error(`Translation failed (${res.status})`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = json.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: { text?: unknown; sourceLang?: unknown };
    try {
      parsed = JSON.parse(cleaned) as { text?: unknown; sourceLang?: unknown };
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'translation response was not JSON');
      throw new Error('Translation response was not valid JSON');
    }

    const text =
      typeof parsed.text === 'string' && parsed.text.trim().length > 0
        ? parsed.text.trim()
        : input.text;
    const sourceLang = isTranslatableLang(parsed.sourceLang)
      ? parsed.sourceLang
      : detectLang(input.text);

    return {
      text,
      sourceLang,
      targetLang: input.targetLang,
      skipped: sourceLang === input.targetLang,
      provider: 'anthropic',
    };
  }
}

// ─── OpenAI provider ────────────────────────────────────────────────────────
// Same JSON contract as the Anthropic provider, via OpenAI chat
// completions — reuses the OPENAI_API_KEY the deploy already has for
// transcription and Smart Resume. Uses `max_completion_tokens` (the
// gpt-5 / o-series parameter) and JSON response mode.

class OpenAiTranslationProvider implements TranslationProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const targetName = LANG_NAMES[input.targetLang];
    const system = `You are a translation engine for Doondo, a blue-collar hiring chat app in India. Translate the user's chat message into ${targetName}.

Rules:
- Output a SINGLE JSON object. No markdown fences, no commentary before or after.
- Shape MUST be: { "text": string, "sourceLang": "en"|"hi"|"ta"|"te"|"kn" }.
- "text" is the message translated naturally into ${targetName}. Keep it conversational and short — it is a chat message, not a document.
- "sourceLang" is the language the ORIGINAL message was written in.
- If the message is already in ${targetName}, return it unchanged with the correct sourceLang.
- Preserve names, phone numbers, addresses, job titles and money amounts exactly.
- Do not add, explain, or omit anything. Translate only what is there.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system' as const, content: system },
          { role: 'user' as const, content: input.text },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'openai translation call failed',
      );
      throw new Error(`Translation failed (${res.status})`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: { text?: unknown; sourceLang?: unknown };
    try {
      parsed = JSON.parse(cleaned) as { text?: unknown; sourceLang?: unknown };
    } catch (err) {
      logger.error({ err, raw: raw.slice(0, 300) }, 'translation response was not JSON');
      throw new Error('Translation response was not valid JSON');
    }

    const text =
      typeof parsed.text === 'string' && parsed.text.trim().length > 0
        ? parsed.text.trim()
        : input.text;
    const sourceLang = isTranslatableLang(parsed.sourceLang)
      ? parsed.sourceLang
      : detectLang(input.text);

    return {
      text,
      sourceLang,
      targetLang: input.targetLang,
      skipped: sourceLang === input.targetLang,
      provider: 'openai',
    };
  }
}

// ─── Provider picker ───────────────────────────────────────────────────────

let cachedProvider: TranslationProvider | null = null;

function pickProvider(): TranslationProvider {
  if (cachedProvider) return cachedProvider;
  if (env.TRANSLATION_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        'TRANSLATION_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.',
      );
    }
    cachedProvider = new AnthropicTranslationProvider(
      env.ANTHROPIC_API_KEY,
      env.ANTHROPIC_TEXT_MODEL,
    );
  } else if (env.TRANSLATION_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('TRANSLATION_PROVIDER=openai but OPENAI_API_KEY is not set.');
    }
    cachedProvider = new OpenAiTranslationProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  } else {
    cachedProvider = new MockTranslationProvider();
  }
  return cachedProvider;
}

// ─── Result cache ───────────────────────────────────────────────────────────
// Chat is repetitive — "Still hiring?", "When can you start?", greetings,
// addresses — so identical (text → targetLang) pairs recur constantly.
// An in-memory cache means we pay the provider once per distinct string.
// Bounded + insertion-ordered, so eviction is just "drop the oldest".

const CACHE_MAX = 500;
const resultCache = new Map<string, TranslationResult>();

// ─── Per-user budget ────────────────────────────────────────────────────────
// Translation fires on every message, so a chatty (or abusive) account
// could run up real provider cost. A simple per-user hourly cap bounds
// it; over budget, the caller leaves the message for a manual retry.

const BUDGET_WINDOW_MS = 60 * 60 * 1000;
const BUDGET_MAX_PER_HOUR = 80;
const budget = new Map<string, { count: number; windowStart: number }>();

/**
 * Reserve one translation against `userId`'s hourly budget. Returns
 * false when the user is over the cap — the caller should then skip the
 * automatic translation (the reader can still retry by hand).
 */
export function consumeTranslationBudget(userId: string): boolean {
  const now = Date.now();
  const b = budget.get(userId);
  if (!b || now - b.windowStart >= BUDGET_WINDOW_MS) {
    budget.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= BUDGET_MAX_PER_HOUR) return false;
  b.count += 1;
  return true;
}

/**
 * Translate one chat message into the reader's language. Cached by
 * (text, targetLang). Throws on a configuration or provider failure —
 * callers (the chat send path) treat translation as best-effort and
 * swallow the error so a failed translation never blocks the message.
 */
export async function translateText(
  input: TranslationInput,
): Promise<TranslationResult> {
  const key = `${input.targetLang} ${input.text}`;
  const cached = resultCache.get(key);
  if (cached) return cached;

  const result = await pickProvider().translate(input);

  resultCache.set(key, result);
  if (resultCache.size > CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  return result;
}

/** Test helper — swap in a fake provider. */
export function __setProviderForTests(provider: TranslationProvider | null): void {
  cachedProvider = provider;
}
