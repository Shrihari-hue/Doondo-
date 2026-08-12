/**
 * Masked-call service — start a privacy-preserving call between the two
 * parties on a hire.
 *
 * Both sides must be on the same Application (so there's an established
 * working relationship). We try to allocate a proxy number via the
 * telephony provider; when none is configured we fall back to the real
 * number — the same one the existing contact-reveal endpoints already
 * expose to these parties — so the call still connects. Every attempt is
 * recorded as a MaskedCallSession for audit and future provider wiring.
 */

import { eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { createProxySession } from '@/lib/maskedCall';
import { getDb } from '@/db/client';
import { applications, maskedCallSessions, users } from '@/db/schema';

export type PartyRole = 'employer' | 'seeker';

export interface CallResult {
  /** 'proxy' = dial the masked number; 'reveal' = dial the real number. */
  mode: 'proxy' | 'reveal';
  /** The number to dial (proxy or real). */
  dialNumber: string | null;
  /** Counterpart's display name. */
  name: string;
  /** True when the number is masked end-to-end. */
  masked: boolean;
}

export async function initiateCall(input: {
  userId: string;
  role: PartyRole;
  applicationId: string;
}): Promise<CallResult> {
  const db = getDb();
  const [app] = await db
    .select({ employerId: applications.employerId, seekerId: applications.seekerId })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!app) throw errors.notFound('Application not found.');

  const callerIsParty =
    (input.role === 'employer' && app.employerId === input.userId) ||
    (input.role === 'seeker' && app.seekerId === input.userId);
  if (!callerIsParty) throw errors.forbidden();

  const calleeId = input.role === 'employer' ? app.seekerId : app.employerId;

  const [[caller], [callee]] = await Promise.all([
    db.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1),
    db.select({ name: users.name, companyName: users.companyName, phone: users.phone }).from(users).where(eq(users.id, calleeId)).limit(1),
  ]);
  if (!callee) throw errors.notFound('The other party was not found.');

  const callerPhone = caller?.phone ?? '';
  const calleePhone = callee.phone ?? '';
  const calleeName = callee.companyName ?? callee.name ?? 'Contact';

  const proxy = await createProxySession({
    fromPhone: callerPhone,
    toPhone: calleePhone,
    ref: input.applicationId,
  });

  const mode: 'proxy' | 'reveal' = proxy ? 'proxy' : 'reveal';
  const dialNumber = proxy ? proxy.proxyNumber : calleePhone || null;

  await db.insert(maskedCallSessions).values({
    applicationId: input.applicationId,
    callerId: input.userId,
    calleeId,
    callerRole: input.role,
    mode,
    provider: env.MASKED_CALL_PROVIDER,
    proxyNumber: proxy?.proxyNumber ?? null,
  });

  return { mode, dialNumber, name: calleeName, masked: mode === 'proxy' };
}
