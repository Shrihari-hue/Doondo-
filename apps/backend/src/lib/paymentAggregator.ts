/**
 * Payment-aggregator abstraction — the money-movement provider behind
 * Doondo Collect (worker QR collections, commission split, bank payouts).
 *
 * Taking a commission and holding a wallet balance makes Doondo a payment
 * intermediary, which legally requires a licensed payment aggregator
 * (Razorpay Route / Cashfree, etc.) with split-settlement, KYC and an
 * escrow/nodal account. That integration isn't wired yet, so this is a
 * clearly-marked hook: with the default `PAYMENT_AGGREGATOR='none'`, money
 * never actually moves — collections are simulated, bank verification is
 * auto-approved, and payouts are recorded but not sent. Real providers
 * slot in behind the env switch.
 *
 * Mirrors the maskedCall / transactionalSms provider pattern.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/** What a worker's collection QR encodes. */
export interface CollectionPayload {
  /** The string the QR encodes — a Doondo pay-link, or a provider intent. */
  payload: string;
  /** True when a real aggregator minted it (money will actually route). */
  live: boolean;
}

/**
 * Build the QR payload for a worker collection. In 'none' mode this is a
 * Doondo pay-link carrying the collection ref (so money would land in
 * Doondo's PA account, enabling the commission split) — NOT the worker's
 * raw VPA, which would bypass the commission entirely.
 */
export function buildCollectionPayload(ref: string, amountPaise: number | null): CollectionPayload {
  if (env.PAYMENT_AGGREGATOR === 'none') {
    const amt = amountPaise != null ? `?amt=${Math.round(amountPaise)}` : '';
    return { payload: `${env.COLLECT_BASE_URL}/c/${ref}${amt}`, live: false };
  }
  // Real providers return a hosted UPI QR / intent here, keyed off
  // env.PAYMENT_AGGREGATOR. Until one is wired we still hand back the
  // Doondo pay-link so the flow is exercised end-to-end.
  logger.warn(
    { provider: env.PAYMENT_AGGREGATOR, ref },
    'payment aggregator not yet wired — using Doondo pay-link payload',
  );
  const amt = amountPaise != null ? `?amt=${Math.round(amountPaise)}` : '';
  return { payload: `${env.COLLECT_BASE_URL}/c/${ref}${amt}`, live: false };
}

export interface BankVerifyResult {
  verified: boolean;
  /** Provider's name on the account (penny-drop), when available. */
  nameAtBank?: string | null;
}

/**
 * Verify a bank account (penny-drop / name match). 'none' mode
 * auto-approves so the flow works in dev; a real provider returns the
 * actual verification + the name on the account.
 */
export async function verifyBankAccount(input: {
  accountNumber: string;
  ifsc: string;
  holderName: string;
}): Promise<BankVerifyResult> {
  if (env.PAYMENT_AGGREGATOR === 'none') {
    return { verified: true, nameAtBank: input.holderName };
  }
  logger.warn({ provider: env.PAYMENT_AGGREGATOR }, 'bank verify not wired — auto-approving');
  return { verified: true, nameAtBank: input.holderName };
}

export interface PayoutResult {
  status: 'processing' | 'paid' | 'failed';
  /** Provider-side payout id for reconciliation. */
  providerRef: string;
}

/**
 * Send a payout to the worker's bank. 'none' mode simulates an instant
 * success and a fake reference — no real money leaves. A real provider
 * (Cashfree Payouts / RazorpayX) initiates an IMPS/UPI transfer.
 */
export async function requestPayout(input: {
  userId: string;
  amountPaise: number;
  accountNumber: string;
  ifsc: string;
}): Promise<PayoutResult> {
  if (env.PAYMENT_AGGREGATOR === 'none') {
    return { status: 'paid', providerRef: `sim_${Date.now()}` };
  }
  logger.warn(
    { provider: env.PAYMENT_AGGREGATOR, userId: input.userId },
    'payout provider not wired — simulating',
  );
  return { status: 'paid', providerRef: `sim_${Date.now()}` };
}
