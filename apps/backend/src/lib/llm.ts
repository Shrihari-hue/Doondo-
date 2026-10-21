/**
 * llm — one small text-generation helper shared by the newer AI features.
 *
 * Provider is AI_TEXT_PROVIDER ('anthropic' | 'openai' | 'mock'), reusing
 * the existing ANTHROPIC_API_KEY / ANTHROPIC_TEXT_MODEL and OPENAI_API_KEY /
 * OPENAI_MODEL settings. Every caller passes a `fallback` — used for the
 * mock provider AND whenever the real provider errors or times out — so an
 * AI outage degrades to template text instead of a failed request.
 */

import { env } from '@/config/env';
import { logger } from './logger';

export interface GenerateInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Ask for a JSON object response; the result is parsed for you. */
  json?: boolean;
  /** Deterministic text used for 'mock' and on any provider failure. */
  fallback: string;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  source: 'ai' | 'fallback';
}

function strip(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function callAnthropic(i: GenerateInput, signal: AbortSignal): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_TEXT_MODEL,
      max_tokens: i.maxTokens ?? 400,
      system: i.system + (i.json ? '\nRespond with a single JSON object and nothing else.' : ''),
      messages: [{ role: 'user', content: i.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return json.content?.find((c) => c.type === 'text')?.text ?? '';
}

async function callOpenAI(i: GenerateInput, signal: AbortSignal): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      max_completion_tokens: Math.max(800, i.maxTokens ?? 400),
      ...(i.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: i.system },
        { role: 'user', content: i.prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  return json.choices?.[0]?.message?.content ?? '';
}

export async function generateText(input: GenerateInput): Promise<GenerateResult> {
  const provider = env.AI_TEXT_PROVIDER;
  if (provider === 'mock') return { text: input.fallback, source: 'fallback' };
  if (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) return { text: input.fallback, source: 'fallback' };
  if (provider === 'openai' && !env.OPENAI_API_KEY) return { text: input.fallback, source: 'fallback' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 12_000);
  try {
    const raw = provider === 'anthropic' ? await callAnthropic(input, ctrl.signal) : await callOpenAI(input, ctrl.signal);
    const text = strip(raw);
    if (!text) throw new Error('empty completion');
    if (input.json) JSON.parse(text); // validate
    return { text, source: 'ai' };
  } catch (err) {
    logger.warn({ err, provider }, 'llm: generation failed — using fallback');
    return { text: input.fallback, source: 'fallback' };
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience: JSON generation with a typed fallback object. */
export async function generateJson<T>(input: Omit<GenerateInput, 'json' | 'fallback'> & { fallback: T }): Promise<{ value: T; source: 'ai' | 'fallback' }> {
  const r = await generateText({ ...input, json: true, fallback: JSON.stringify(input.fallback) });
  try {
    return { value: JSON.parse(r.text) as T, source: r.source };
  } catch {
    return { value: input.fallback, source: 'fallback' };
  }
}
