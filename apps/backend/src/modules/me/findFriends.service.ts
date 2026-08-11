/**
 * Find Friends — given a list of phone-number hashes from the seeker's
 * address book, return the subset that match Doondo users.
 *
 * Privacy posture:
 *   - The client sends SHA-256 hashes of normalised phone numbers
 *     (E.164 with the country code), never raw numbers.
 *   - The server keeps a precomputed phone-hash index on the user
 *     table so this lookup is O(1) per submitted hash.
 *   - We return only the matched users' public profile fields — name,
 *     id, role, photoUrl. The unmatched hashes are dropped silently so
 *     the server can't infer what's in your phone book beyond the hits.
 *
 * Backfill: phoneHash is populated on signup + phone-verify going
 * forward. Existing users get backfilled lazily the next time they
 * log in.
 */

import { and, inArray, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';

export interface FoundFriend {
  id: string;
  name: string;
  role: 'seeker' | 'employer';
  photoUrl: string | null;
  /** Tells the UI whether to show "Open profile" vs. "Invite". Always
   *  true here because we only return matched users; the surface for
   *  un-matched hashes is computed client-side. */
  onDoondo: true;
  /**
   * The submitted hash this user matched on — echoed back so the client
   * can tie the match to a specific address-book contact (show their
   * saved name, and drop them from the invite list). No new information
   * leaks: the client sent this exact hash in the request.
   */
  matchedHash: string | null;
}

/**
 * Match the supplied phone-number hashes against Doondo's user table.
 * Caller scopes the request to their own seekerId so we can drop
 * results that point back at themselves.
 */
export async function findByHashes(
  viewerId: string,
  phoneHashes: string[],
): Promise<FoundFriend[]> {
  if (phoneHashes.length === 0) return [];
  // De-dupe + cap so a malicious client can't ship 100k hashes.
  const unique = Array.from(new Set(phoneHashes)).slice(0, 2000);

  const rows = await getDb()
    .select({ id: users.id, name: users.name, role: users.role, photoUrl: users.photoUrl, phoneHash: users.phoneHash })
    .from(users)
    .where(and(inArray(users.phoneHash, unique), ne(users.id, viewerId)))
    .limit(500);

  return rows.map((u) => ({
    id: u.id,
    name: u.name ?? '',
    role: u.role as 'seeker' | 'employer',
    photoUrl: u.photoUrl ?? null,
    onDoondo: true as const,
    matchedHash: u.phoneHash ?? null,
  }));
}

/**
 * Normalise + hash a single phone number into the same representation
 * used by the user index. Implementation lives in lib/phoneHash so the
 * user model's pre-save hook can use it without a circular import;
 * re-exported here for the existing callers (trust-circle pings, SOS).
 */
export { hashPhone } from '@/lib/phoneHash';
