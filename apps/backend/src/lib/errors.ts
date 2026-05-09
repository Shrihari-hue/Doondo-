/**
 * AppError + the response envelope.
 *
 * Every error the app raises should be an AppError (or thrown by a library
 * we explicitly handle in the error middleware). This guarantees:
 *   - a stable error.code the client can branch on
 *   - a safe message to show humans
 *   - an http status that matches the situation
 *
 * Never expose internal stack traces to clients; the error middleware
 * formats AppError into a clean envelope and logs the details server-side.
 */

export type ErrorCode =
  // Auth
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_TAKEN'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_REFRESH_REUSED'
  | 'AUTH_REFRESH_REVOKED'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN'
  // Validation + general
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  // Jobs
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_OPEN'
  // Applications
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_ALREADY_EXISTS'
  | 'APPLICATION_INVALID_TRANSITION'
  // Chat
  | 'CONVERSATION_NOT_FOUND'
  // Verification (Phase 5)
  | 'VERIFICATION_OTP_INVALID'
  | 'VERIFICATION_OTP_EXPIRED'
  | 'VERIFICATION_OTP_TOO_MANY'
  | 'VERIFICATION_OTP_NOT_FOUND'
  | 'VERIFICATION_PHONE_REQUIRED'
  | 'VERIFICATION_SELFIE_REQUIRED'
  | 'VERIFICATION_GSTIN_REQUIRED'
  | 'VERIFICATION_ALREADY_VERIFIED';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  status: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly cause: unknown;

  constructor({ code, message, status, details, cause }: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details ?? null;
    this.cause = cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ─── Convenience constructors ─────────────────────────────────────────────────

export const errors = {
  invalidCredentials: () =>
    new AppError({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
      status: 401,
    }),
  emailTaken: () =>
    new AppError({
      code: 'AUTH_EMAIL_TAKEN',
      message: 'An account with this email already exists.',
      status: 409,
    }),
  tokenInvalid: () =>
    new AppError({
      code: 'AUTH_TOKEN_INVALID',
      message: 'Token is invalid or malformed.',
      status: 401,
    }),
  tokenExpired: () =>
    new AppError({
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Token has expired.',
      status: 401,
    }),
  refreshReused: () =>
    new AppError({
      code: 'AUTH_REFRESH_REUSED',
      message: 'Refresh token reuse detected. Please sign in again.',
      status: 401,
    }),
  refreshRevoked: () =>
    new AppError({
      code: 'AUTH_REFRESH_REVOKED',
      message: 'Refresh token has been revoked.',
      status: 401,
    }),
  unauthorized: (message = 'Authentication required.') =>
    new AppError({ code: 'AUTH_UNAUTHORIZED', message, status: 401 }),
  forbidden: (message = "You don't have permission to do that.") =>
    new AppError({ code: 'AUTH_FORBIDDEN', message, status: 403 }),
  notFound: (message = 'Resource not found.') =>
    new AppError({ code: 'NOT_FOUND', message, status: 404 }),
  validation: (details: unknown, message = 'Request failed validation.') =>
    new AppError({ code: 'VALIDATION_FAILED', message, status: 400, details }),
  conflict: (message = 'Conflicting state.') =>
    new AppError({ code: 'CONFLICT', message, status: 409 }),
  rateLimited: (message = 'Too many requests.') =>
    new AppError({ code: 'RATE_LIMITED', message, status: 429 }),
  internal: (cause?: unknown) =>
    new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
      status: 500,
      cause,
    }),
  jobNotFound: () =>
    new AppError({
      code: 'JOB_NOT_FOUND',
      message: 'Job not found.',
      status: 404,
    }),
  jobNotOpen: () =>
    new AppError({
      code: 'JOB_NOT_OPEN',
      message: 'This job is no longer accepting applications.',
      status: 409,
    }),
  applicationNotFound: () =>
    new AppError({
      code: 'APPLICATION_NOT_FOUND',
      message: 'Application not found.',
      status: 404,
    }),
  applicationAlreadyExists: () =>
    new AppError({
      code: 'APPLICATION_ALREADY_EXISTS',
      message: "You've already applied to this job.",
      status: 409,
    }),
  applicationInvalidTransition: (from: string, to: string) =>
    new AppError({
      code: 'APPLICATION_INVALID_TRANSITION',
      message: `Cannot move application from ${from} to ${to}.`,
      status: 409,
    }),
  conversationNotFound: () =>
    new AppError({
      code: 'CONVERSATION_NOT_FOUND',
      message: 'Conversation not found.',
      status: 404,
    }),
  // ─── Verification (Phase 5) ───────────────────────────────────────────
  otpInvalid: () =>
    new AppError({
      code: 'VERIFICATION_OTP_INVALID',
      message: 'That code is incorrect. Try again.',
      status: 400,
    }),
  otpExpired: () =>
    new AppError({
      code: 'VERIFICATION_OTP_EXPIRED',
      message: 'This code has expired. Request a new one.',
      status: 400,
    }),
  otpTooMany: () =>
    new AppError({
      code: 'VERIFICATION_OTP_TOO_MANY',
      message: 'Too many wrong attempts. Request a new code.',
      status: 429,
    }),
  otpNotFound: () =>
    new AppError({
      code: 'VERIFICATION_OTP_NOT_FOUND',
      message: 'No active code for this number. Request a new one.',
      status: 404,
    }),
  verificationPhoneRequired: () =>
    new AppError({
      code: 'VERIFICATION_PHONE_REQUIRED',
      message: 'Confirm your phone number first.',
      status: 409,
    }),
  verificationSelfieRequired: () =>
    new AppError({
      code: 'VERIFICATION_SELFIE_REQUIRED',
      message: 'A selfie is required to finish verification.',
      status: 409,
    }),
  verificationGstinRequired: () =>
    new AppError({
      code: 'VERIFICATION_GSTIN_REQUIRED',
      message: 'Add a valid GSTIN before verifying as an employer.',
      status: 409,
    }),
  verificationAlreadyVerified: () =>
    new AppError({
      code: 'VERIFICATION_ALREADY_VERIFIED',
      message: 'This account is already verified.',
      status: 409,
    }),
};
