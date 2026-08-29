import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import { friendlyErrorMessage } from './friendlyError';

function apiError(overrides: Partial<ConstructorParameters<typeof ApiError>[0]> = {}): ApiError {
  return new ApiError({
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side.',
    status: 500,
    ...overrides,
  });
}

describe('friendlyErrorMessage', () => {
  it('maps a known ApiError code to its friendly text', () => {
    const err = apiError({ code: 'AUTH_TOKEN_EXPIRED', status: 401 });
    expect(friendlyErrorMessage(err, 'fallback')).toBe(
      'You were signed out for security. Please sign in again.',
    );
  });

  it('prefers a generic retry message for a transient (5xx) ApiError with no specific mapping', () => {
    const err = apiError({ code: 'CONFLICT', status: 500, message: 'boom' });
    expect(friendlyErrorMessage(err, 'fallback')).toBe('Something went wrong. Please try again.');
  });

  it('reuses the backend message for a non-transient 4xx ApiError with user-safe text', () => {
    const err = apiError({
      code: 'VALIDATION_FAILED',
      status: 400,
      message: 'Password must include letters and numbers',
    });
    expect(friendlyErrorMessage(err, 'fallback')).toBe(
      'Password must include letters and numbers',
    );
  });

  it('falls back when a non-transient ApiError message looks technical', () => {
    const err = apiError({
      code: 'VALIDATION_FAILED',
      status: 400,
      message: 'Cannot read properties of undefined (reading foo)',
    });
    expect(friendlyErrorMessage(err, 'fallback text')).toBe('fallback text');
  });

  it('reuses a plain Error message when it does not look technical', () => {
    const err = new Error('Please pick a role first.');
    expect(friendlyErrorMessage(err, 'fallback')).toBe('Please pick a role first.');
  });

  it('falls back for a plain Error with a technical-looking message', () => {
    const err = new Error('Network request failed');
    expect(friendlyErrorMessage(err, 'fallback')).toBe('fallback');
  });

  it('falls back for a completely unknown thrown value', () => {
    expect(friendlyErrorMessage('a bare string was thrown', 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('never returns "Network request failed" verbatim, even when that is the actual message', () => {
    const err = apiError({
      code: 'VALIDATION_FAILED',
      status: 400,
      message: 'network request failed',
    });
    const result = friendlyErrorMessage(err, 'fallback');
    expect(result.toLowerCase()).not.toContain('network request failed');
  });
});
