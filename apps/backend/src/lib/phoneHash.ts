/**
 * Phone-number hashing for privacy-preserving contact matching (Find
 * Friends, Trust Circle pings, SOS peer match).
 *
 * Lives in lib (not the me module) so the user model can compute the
 * stored `phoneHash` in a pre-save hook without a circular import.
 *
 * Normalisation: strip everything but digits, then SHA-256 → lowercase
 * hex. The mobile client hashes several variants per contact (digits as
 * saved, last-10, "91"+last-10) so country-code formatting differences
 * still match this stored form.
 */

import crypto from 'crypto';

export function hashPhone(input: string): string {
  const normalised = input.replace(/[^0-9]/g, '');
  return crypto.createHash('sha256').update(normalised).digest('hex');
}
