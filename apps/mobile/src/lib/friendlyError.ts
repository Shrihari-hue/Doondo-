/**
 * friendlyError — turn any caught exception into a human-friendly
 * string for inline error panels, alerts, and toasts.
 *
 * Reasoning:
 *   Raw `err.message` is good enough for engineers but useless to
 *   users — "Network request failed", "TypeError: Cannot read
 *   properties of undefined", and similar leak through. Every screen
 *   that catches an error should pipe it through this so the user
 *   sees something they can act on.
 *
 * Strategy:
 *   1. ApiError with a known code → branch-specific friendly text.
 *   2. ApiError without a known mapping → reuse the message the
 *      backend already sent (the controllers write user-safe copy).
 *   3. Other Error subclasses with a short, non-technical message →
 *      use the message as-is.
 *   4. Anything else → the caller's `fallback` string.
 *
 * Crucially: never returns "Network request failed", "fetch failed",
 * stack traces, or undefined.
 */

import { ApiError } from '@/api/errors';

const TECHNICAL_MESSAGE_FRAGMENTS = [
  'fetch failed',
  'network request failed',
  'failed to fetch',
  'load failed',
  'aborted',
  'unknown error',
  'undefined',
  'null is not an object',
  'cannot read property',
  'cannot read properties',
];

const FRIENDLY_API_MESSAGES: Partial<Record<string, string>> = {
  NETWORK_ERROR:
    'Looks like the network is slow. Check your connection and try again.',
  AUTH_TOKEN_EXPIRED: 'You were signed out for security. Please sign in again.',
  AUTH_TOKEN_INVALID: 'Your session ended. Please sign in again.',
  AUTH_REFRESH_REUSED: 'Your session ended. Please sign in again.',
  AUTH_REFRESH_REVOKED: 'Your session ended. Please sign in again.',
  AUTH_UNAUTHORIZED: 'Please sign in to continue.',
  RATE_LIMITED: 'You hit a rate limit. Wait a moment and try again.',
  INTERNAL_ERROR:
    'Something went wrong on our end. Please try again in a moment.',
};

export function friendlyErrorMessage(err: unknown, fallback: string): string {
  // 1. ApiError path.
  if (err instanceof ApiError) {
    const mapped = FRIENDLY_API_MESSAGES[err.code];
    if (mapped) return mapped;
    // For 5xx / transient codes that didn't get a specific mapping,
    // still prefer a friendly generic over the raw message.
    if (err.isTransient) {
      return 'Something went wrong. Please try again.';
    }
    // 4xx with a backend message — controllers already write
    // user-safe copy on the way out.
    if (err.message && !looksTechnical(err.message)) {
      return err.message;
    }
    return fallback;
  }

  // 2. Plain Error path.
  if (err instanceof Error && err.message && !looksTechnical(err.message)) {
    return err.message;
  }

  // 3. Unknown.
  return fallback;
}

function looksTechnical(message: string): boolean {
  const lower = message.toLowerCase();
  return TECHNICAL_MESSAGE_FRAGMENTS.some((frag) => lower.includes(frag));
}
