/**
 * fetch-based API client for Doondo's backend.
 *
 * Responsibilities (in order):
 *   1. Build the URL: ${API_URL}/api/${API_VERSION}${path}.
 *   2. Attach Bearer access token (unless { auth: false }).
 *   3. Send the request, parse the envelope, throw ApiError on !ok.
 *   4. On 401 with AUTH_TOKEN_EXPIRED, refresh the access token ONCE and
 *      retry the original request. A single in-flight refresh is shared
 *      across concurrent failed requests.
 *   5. If refresh fails, signal the auth store to log out.
 *
 * The store is wired in from outside via setAuthAdapter() so this file
 * doesn't import the store directly — keeps the dependency one-way and
 * lets us unit-test the client with a mock adapter.
 */

import Constants from 'expo-constants';
import { ApiError } from './errors';
import type { ApiErrorCode, ApiSuccess, ApiErrorEnvelope } from './types';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_VERSION = process.env.EXPO_PUBLIC_API_VERSION ?? 'v1';
const APP_VERSION = (Constants.expoConfig?.version as string | undefined) ?? '0.0.0';

// ─── Auth adapter — wired in from the store at app start ─────────────────────

export interface AuthAdapter {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  /** Called after a successful refresh — store new tokens. */
  onTokensRefreshed: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Called when refresh fails — log the user out. */
  onAuthFailure: () => Promise<void>;
}

let authAdapter: AuthAdapter | null = null;

export function setAuthAdapter(adapter: AuthAdapter): void {
  authAdapter = adapter;
}

// ─── Public request API ──────────────────────────────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Attach Bearer access token. Default true. */
  auth?: boolean;
  /** Override timeout in ms. Default 20s. */
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return doRequest<T>(path, opts, /* hasRetried */ false);
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function doRequest<T>(
  path: string,
  opts: RequestOptions,
  hasRetried: boolean,
): Promise<T> {
  const url = `${API_URL}/api/${API_VERSION}${path}`;
  const method = opts.method ?? 'GET';
  const auth = opts.auth ?? true;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client': 'doondo-mobile',
    'X-App-Version': APP_VERSION,
    ...opts.headers,
  };

  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = authAdapter?.getAccessToken() ?? null;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message:
        err instanceof Error && err.name === 'AbortError'
          ? 'Request timed out. Check your connection and try again.'
          : 'Network unavailable. Check your connection and try again.',
      status: 0,
    });
  }
  clearTimeout(timer);

  // Try to parse JSON regardless of status — backend always sends an envelope.
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Server returned non-JSON (e.g. HTML error page from a proxy).
  }

  if (res.ok && isSuccess(payload)) {
    return (payload as ApiSuccess<T>).data;
  }

  if (!res.ok && isErrorEnvelope(payload)) {
    const env = payload as ApiErrorEnvelope;

    // Refresh-and-retry path for token expiry. Only retry once per request.
    if (
      !hasRetried &&
      auth &&
      res.status === 401 &&
      env.error.code === 'AUTH_TOKEN_EXPIRED' &&
      authAdapter
    ) {
      const refreshed = await refreshAccessTokenOnce();
      if (refreshed) {
        return doRequest<T>(path, opts, /* hasRetried */ true);
      }
    }

    throw new ApiError({
      code: env.error.code,
      message: env.error.message,
      status: res.status,
      details: env.error.details,
      requestId: env.requestId,
    });
  }

  // Fallback when the response isn't even our envelope shape.
  throw new ApiError({
    code: 'UNKNOWN_ERROR',
    message: `Unexpected response (status ${res.status}).`,
    status: res.status,
  });
}

// ─── Refresh coalescing — a single in-flight refresh per app ─────────────────

let inFlightRefresh: Promise<boolean> | null = null;

async function refreshAccessTokenOnce(): Promise<boolean> {
  if (!authAdapter) return false;
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const refreshToken = authAdapter!.getRefreshToken();
      if (!refreshToken) {
        await authAdapter!.onAuthFailure();
        return false;
      }
      const res = await fetch(`${API_URL}/api/${API_VERSION}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = (await res.json().catch(() => null)) as ApiSuccess<{
        tokens: { accessToken: string; refreshToken: string };
      }> | null;

      if (!res.ok || !payload || !isSuccess(payload)) {
        await authAdapter!.onAuthFailure();
        return false;
      }
      await authAdapter!.onTokensRefreshed(
        payload.data.tokens.accessToken,
        payload.data.tokens.refreshToken,
      );
      return true;
    } catch {
      await authAdapter?.onAuthFailure();
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

// ─── Type guards ─────────────────────────────────────────────────────────────

function isSuccess(p: unknown): p is ApiSuccess<unknown> {
  return typeof p === 'object' && p !== null && (p as { ok?: unknown }).ok === true;
}

function isErrorEnvelope(p: unknown): p is ApiErrorEnvelope {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as { ok?: unknown }).ok === false &&
    typeof (p as { error?: { code?: ApiErrorCode } }).error?.code === 'string'
  );
}
