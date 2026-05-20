/**
 * Quick-reply template catalog.
 *
 * The chat language gap is the quiet killer of blue-collar hiring: an
 * employer types in Hindi, the worker reads Tamil, and the thread
 * stalls on a misunderstanding. Quick replies fix the highest-frequency
 * exchanges — "When can you start?", "Yes, I am available." — by
 * sending a *template key* instead of free text. The recipient's app
 * renders that key through i18n, so each side reads the message in
 * their own language.
 *
 * How a templated message travels:
 *   1. Sender taps a chip. The mobile sends { body, templateKey } where
 *      `body` is the English text (the universal fallback) and
 *      `templateKey` is the i18n key below.
 *   2. The server stores both verbatim — it treats `templateKey` as an
 *      opaque string and never needs this catalog.
 *   3. Every client (sender included) renders the message with
 *      `t(templateKey)`. If the key is unknown to that build, it falls
 *      back to `body`.
 *
 * `key` doubles as the templateKey and the i18n lookup path, so the
 * matching strings must exist under `quick_replies.*` in every locale
 * file. `en` is the English text used for the `body` fallback; it must
 * stay identical to the `en.json` value for the same key.
 */

export interface QuickReply {
  /** i18n key — also the opaque templateKey persisted on the message. */
  key: string;
  /** English text. Sent as the message `body` (fallback for old clients). */
  en: string;
}

/** Templates an employer sends to a worker. */
export const EMPLOYER_QUICK_REPLIES: ReadonlyArray<QuickReply> = [
  { key: 'quick_replies.emp.available_tomorrow', en: 'Are you available tomorrow?' },
  { key: 'quick_replies.emp.when_can_start', en: 'When can you start?' },
  { key: 'quick_replies.emp.come_for_interview', en: 'Can you come for an interview?' },
  { key: 'quick_replies.emp.share_location', en: 'Please share your location.' },
  { key: 'quick_replies.emp.bring_documents', en: 'Please bring your ID and documents.' },
  { key: 'quick_replies.emp.position_filled', en: 'Thank you. This position has been filled.' },
];

/** Templates a worker sends to an employer. */
export const SEEKER_QUICK_REPLIES: ReadonlyArray<QuickReply> = [
  { key: 'quick_replies.seek.yes_available', en: 'Yes, I am available.' },
  { key: 'quick_replies.seek.not_available', en: 'Sorry, I am not available right now.' },
  { key: 'quick_replies.seek.what_is_pay', en: 'What is the pay for this job?' },
  { key: 'quick_replies.seek.where_is_job', en: 'Where is the job located?' },
  { key: 'quick_replies.seek.what_time', en: 'What time should I come?' },
  { key: 'quick_replies.seek.on_my_way', en: 'I am on my way.' },
];

/**
 * The template set a sender picks from, keyed by *their own* role.
 * Anyone who isn't an employer (seekers, and the safe default) gets the
 * worker set.
 */
export function quickRepliesForRole(
  role: string | null | undefined,
): ReadonlyArray<QuickReply> {
  return role === 'employer' ? EMPLOYER_QUICK_REPLIES : SEEKER_QUICK_REPLIES;
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Resolve a message's display text. A templated message renders through
 * i18n into the *reader's* language; if the key is missing (an older
 * build that predates this template) we fall back to the stored English
 * `body`. Plain messages just use `body`.
 *
 * The `translated === templateKey` check catches i18next's "key not
 * found" behaviour, where `t()` echoes the key straight back.
 */
export function renderMessageBody(
  body: string,
  templateKey: string | null | undefined,
  t: TFn,
): string {
  if (!templateKey) return body;
  const translated = t(templateKey);
  if (!translated || translated === templateKey) return body;
  return translated;
}
