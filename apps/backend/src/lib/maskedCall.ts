/**
 * Masked calling — number-privacy provider abstraction.
 *
 * Real masked calling needs a telephony provider (Exotel / Twilio / Knowlarity)
 * that allocates a temporary proxy number bridging the two parties so
 * neither sees the other's real phone. That integration isn't wired yet,
 * so this is a clearly-marked hook: when `MASKED_CALL_PROVIDER` is the
 * default 'none', `createProxySession` returns null and the caller falls
 * back to the existing (already-gated) number reveal — i.e. the call still
 * works, it just isn't masked until a provider is configured.
 *
 * Mirrors the transactionalSms / OTP provider pattern: a thin interface,
 * a no-op default, real providers slot in behind the env switch. Never
 * throws — the caller treats null as "no proxy available".
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface ProxySession {
  /** The temporary number BOTH parties dial; the provider bridges the call. */
  proxyNumber: string;
  /** Provider-side session id, stored for reconciliation / teardown. */
  sessionId: string;
  /** When the proxy mapping expires (ISO). */
  expiresAt: string;
}

export interface CreateProxyInput {
  fromPhone: string;
  toPhone: string;
  /** Opaque ref (e.g. applicationId) for the provider's call log. */
  ref: string;
}

/**
 * Allocate a proxy number bridging two phones. Returns null when no
 * provider is configured (the default) — the caller then reveals the real
 * number instead. Best-effort: any provider error resolves to null.
 */
export async function createProxySession(
  input: CreateProxyInput,
): Promise<ProxySession | null> {
  try {
    if (!input.fromPhone || !input.toPhone) return null;
    if (env.MASKED_CALL_PROVIDER === 'none') return null;

    // Real providers (Exotel/Twilio) slot in here, keyed off
    // env.MASKED_CALL_PROVIDER. Until one is wired we log and return null
    // so the reveal fallback engages — the honest dev behaviour.
    logger.warn(
      { provider: env.MASKED_CALL_PROVIDER, ref: input.ref },
      'masked-call provider not yet wired — falling back to number reveal',
    );
    return null;
  } catch (err) {
    logger.warn({ err }, 'masked-call proxy session failed');
    return null;
  }
}
