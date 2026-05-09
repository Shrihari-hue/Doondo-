/**
 * Client-side ApiError — wraps any non-ok response in a typed exception.
 *
 * Carries the backend's error code so screens can branch on intent
 * (`AUTH_EMAIL_TAKEN` → highlight the email field) without parsing strings.
 *
 * Network failures and unexpected response shapes are surfaced as
 * NETWORK_ERROR / UNKNOWN_ERROR so callers always see an ApiError.
 */

import type { ApiErrorCode, ValidationIssue } from './types';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(opts: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string | null;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details ?? null;
    this.requestId = opts.requestId ?? null;
  }

  /** True for 5xx + network errors — generally worth retrying. */
  get isTransient(): boolean {
    return this.status >= 500 || this.code === 'NETWORK_ERROR';
  }

  /** True if the user needs to re-authenticate. */
  get isAuthFailure(): boolean {
    return (
      this.code === 'AUTH_TOKEN_INVALID' ||
      this.code === 'AUTH_TOKEN_EXPIRED' ||
      this.code === 'AUTH_REFRESH_REUSED' ||
      this.code === 'AUTH_REFRESH_REVOKED' ||
      this.code === 'AUTH_UNAUTHORIZED'
    );
  }

  /**
   * If this is a VALIDATION_FAILED error, returns the per-field issues.
   * Otherwise null. Components can use this to set field-level error text.
   */
  get validationIssues(): ValidationIssue[] | null {
    if (this.code !== 'VALIDATION_FAILED') return null;
    if (!Array.isArray(this.details)) return null;
    return this.details as ValidationIssue[];
  }
}
