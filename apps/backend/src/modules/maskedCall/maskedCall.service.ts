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

import { Types } from 'mongoose';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { createProxySession } from '@/lib/maskedCall';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { MaskedCallSessionModel } from './maskedCall.model';

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
  const app = await ApplicationModel.findById(input.applicationId)
    .select('employerId seekerId')
    .lean();
  if (!app) throw errors.notFound('Application not found.');

  const employerId = (app.employerId as unknown as Types.ObjectId).toString();
  const seekerId = (app.seekerId as unknown as Types.ObjectId).toString();
  const callerIsParty =
    (input.role === 'employer' && employerId === input.userId) ||
    (input.role === 'seeker' && seekerId === input.userId);
  if (!callerIsParty) throw errors.forbidden();

  const calleeId = input.role === 'employer' ? seekerId : employerId;

  const [caller, callee] = await Promise.all([
    UserModel.findById(input.userId).select('phone').lean(),
    UserModel.findById(calleeId).select('name companyName phone').lean(),
  ]);
  if (!callee) throw errors.notFound('The other party was not found.');

  const callerPhone = (caller as { phone?: string } | null)?.phone ?? '';
  const calleePhone = (callee as { phone?: string } | null)?.phone ?? '';
  const calleeName =
    (callee as { companyName?: string | null }).companyName ??
    (callee as { name?: string } | null)?.name ??
    'Contact';

  const proxy = await createProxySession({
    fromPhone: callerPhone,
    toPhone: calleePhone,
    ref: input.applicationId,
  });

  const mode: 'proxy' | 'reveal' = proxy ? 'proxy' : 'reveal';
  const dialNumber = proxy ? proxy.proxyNumber : calleePhone || null;

  await MaskedCallSessionModel.create({
    applicationId: new Types.ObjectId(input.applicationId),
    callerId: new Types.ObjectId(input.userId),
    calleeId: new Types.ObjectId(calleeId),
    callerRole: input.role,
    mode,
    provider: env.MASKED_CALL_PROVIDER,
    proxyNumber: proxy?.proxyNumber ?? null,
  });

  return { mode, dialNumber, name: calleeName, masked: mode === 'proxy' };
}
