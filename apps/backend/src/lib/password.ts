/**
 * Password hashing wrapper around bcrypt.
 *
 * Two reasons we wrap bcrypt instead of using it directly everywhere:
 *   1. The cost factor is read from env in one place.
 *   2. If we ever migrate to argon2 or scrypt, we change one file.
 */

import bcrypt from 'bcrypt';
import { env } from '@/config/env';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  // Guard against missing/empty inputs. bcrypt.compare throws
  // "data and hash arguments required" if either side is falsy, which would
  // surface as a 500 in callers. Treat it as a failed verification instead.
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}
