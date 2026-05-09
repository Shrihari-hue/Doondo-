/**
 * Lightweight ID utilities.
 *
 * - newRequestId(): a short, URL-safe ID for request correlation. Cheap to
 *   generate, easy to grep across logs.
 * - sha256(): one-way hash for storing refresh tokens at rest.
 */

import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A 12-character base62 ID. ~71 bits of entropy — plenty for log correlation. */
export function newRequestId(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    // Non-null assertion because i < bytes.length guarantees the index exists.
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** SHA-256 hash, hex-encoded. Deterministic — same input → same output. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
