/**
 * Error tracking — Sentry wrapper.
 *
 * Wrapped defensively so a build without sentry-expo installed doesn't
 * crash. The init runs once at module load; the helpers (setUser,
 * capture) become no-ops when the SDK isn't available.
 *
 * PII redaction: we never put phone numbers, email addresses, or any
 * other identifying field into breadcrumbs. The user id is fine
 * because it's an opaque ObjectId — useful for cross-referencing in
 * support tickets without leaking real personal data.
 *
 * Env: reads EXPO_PUBLIC_SENTRY_DSN. If unset, Sentry stays disabled
 * and capture() calls quietly log to the console in dev.
 */

interface SentryModule {
  init: (opts: Record<string, unknown>) => void;
  setUser: (user: { id?: string } | null) => void;
  captureException: (err: unknown, opts?: Record<string, unknown>) => void;
  captureMessage: (msg: string, opts?: Record<string, unknown>) => void;
  addBreadcrumb?: (b: Record<string, unknown>) => void;
}

let sentry: SentryModule | null = null;
let enabled = false;

function tryInit(): void {
  if (enabled) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    // Indirect require so Metro doesn't fail when sentry-expo isn't
    // installed. Once you add the dep + DSN, Sentry initialises at
    // runtime and starts capturing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const name = 'sentry-expo';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(name) as Record<string, unknown>;
    const initFn = (mod.init ?? (mod as { default?: { init?: unknown } }).default?.init) as
      | ((opts: Record<string, unknown>) => void)
      | undefined;
    const Native = mod.Native as SentryModule | undefined;
    if (!initFn || !Native) return;
    initFn({
      dsn,
      enableInExpoDevelopment: false,
      debug: false,
      tracesSampleRate: 0.1,
    });
    sentry = Native;
    enabled = true;
  } catch {
    // SDK not installed — that's fine. Capture becomes a no-op.
    enabled = false;
  }
}

// Boot at module load. Safe to call repeatedly (early return).
tryInit();

export function setErrorUser(user: { id?: string | null } | null): void {
  if (!enabled || !sentry) return;
  try {
    if (user?.id) sentry.setUser({ id: user.id });
    else sentry.setUser(null);
  } catch {
    /* ignore */
  }
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled || !sentry) {
    if (__DEV__) console.warn('[error]', err, context);
    return;
  }
  try {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}

export function captureMessage(msg: string, context?: Record<string, unknown>): void {
  if (!enabled || !sentry) {
    if (__DEV__) console.info('[note]', msg, context);
    return;
  }
  try {
    sentry.captureMessage(msg, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  if (!enabled || !sentry?.addBreadcrumb) return;
  try {
    sentry.addBreadcrumb({
      category,
      message,
      data: data ?? {},
      level: 'info',
    });
  } catch {
    /* ignore */
  }
}

/** Wrap a promise so unhandled rejections get captured. */
export function trackAsync<T>(promise: Promise<T>, context?: Record<string, unknown>): Promise<T> {
  return promise.catch((err) => {
    captureError(err, context);
    throw err;
  });
}

/** True if Sentry is wired up and capturing. Helpful for branching debug code. */
export function isErrorTrackingEnabled(): boolean {
  return enabled;
}
