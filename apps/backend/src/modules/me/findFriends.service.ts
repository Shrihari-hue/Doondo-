/**
 * Find Friends — given a list of phone-number hashes from the seeker's
 * address book, return the subset that match Doondo users.
 *
 * Privacy posture:
 *   - The client sends SHA-256 hashes of normalised phone numbers
 *     (E.164 with the country code), never raw numbers.
 *   - The server keeps a precomputed phone-hash index on the user
 *     collection so this lookup is O(1) per submitted hash.
 *   - We return only the matched users' public profile fields — name,
 *     id, role, photoUrl. The unmatched hashes are dropped silently so
 *     the server can't infer what's in your phone book beyond the hits.
 *
 * Backfill: phoneHash is populated on signup + phone-verify going
 * forward. Existing users get backfilled lazily the next time they
 * log in.
 */

import { Types } from 'mongoose';
import crypto from 'crypto';
import { UserModel } from '@/modules/users/user.model';

export interface FoundFriend {
  id: string;
  name: string;
  role: 'seeker' | 'employer';
  photoUrl: string | null;
  /** Tells the UI whether to show "Open profile" vs. "Invite". Always
   *  true here because we only return matched users; the surface for
   *  un-matched hashes is computed client-side. */
  onDoondo: true;
}

/**
 * Match the supplied phone-number hashes against Doondo's user table.
 * Caller scopes the request to their own seekerId so we can drop
 * results that point back at themselves.
 */
export async function findByHashes(
  viewerId: string | Types.ObjectId,
  phoneHashes: string[],
): Promise<FoundFriend[]> {
  if (phoneHashes.length === 0) return [];
  // De-dupe + cap so a malicious client can't ship 100k hashes.
  const unique = Array.from(new Set(phoneHashes)).slice(0, 2000);
  const vid = new Types.ObjectId(viewerId);

  const users = await UserModel.find({
    phoneHash: { $in: unique },
    _id: { $ne: vid },
  })
    .select('name role photoUrl')
    .limit(500)
    .lean();

  return users.map((u) => ({
    id: (u._id as Types.ObjectId).toString(),
    name: (u.name as string) ?? '',
    role: u.role as 'seeker' | 'employer',
    photoUrl: (u.photoUrl as string | null | undefined) ?? null,
    onDoondo: true as const,
  }));
}

/**
 * Normalise + hash a single phone number into the same representation
 * used by the user index. The mobile client uses the matching function
 * to avoid round-trip drift.
 *
 *   - Strip whitespace, dashes, parentheses
 *   - Drop a leading '+'
 *   - Hash with SHA-256 and return lowercase hex
 */
export function hashPhone(input: string): string {
  const normalised = input.replace(/[^0-9]/g, '');
  return crypto.createHash('sha256').update(normalised).digest('hex');
}
