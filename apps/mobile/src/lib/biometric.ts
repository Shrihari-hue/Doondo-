/**
 * biometric — a thin wrapper over expo-local-authentication.
 *
 * The phone's fingerprint / face / screen-lock can't authenticate the
 * worker to Doondo's server — it only confirms "the person holding the
 * phone is its owner". So it's used as an *unlock gate*: after one
 * online password login, every later app-open can be gated by a quick
 * device unlock instead of re-typing a password.
 *
 * Lazy-`require`d (not imported) so a build without the native module
 * degrades cleanly to "biometric unavailable" rather than crashing —
 * the same pattern downloads.ts uses for expo-sqlite.
 */

interface LocalAuthModule {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (opts?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean }>;
}

let modPromise: Promise<LocalAuthModule | null> | null = null;

function getModule(): Promise<LocalAuthModule | null> {
  if (modPromise) return modPromise;
  modPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('expo-local-authentication') as LocalAuthModule;
    } catch {
      return null;
    }
  })();
  return modPromise;
}

/**
 * True only when the device has biometric hardware AND an enrolled
 * credential (a fingerprint, face, or screen PIN/pattern). The app-lock
 * toggle is hidden unless this is true — there's nothing to unlock with
 * otherwise.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const mod = await getModule();
  if (!mod) return false;
  try {
    const [hasHardware, enrolled] = await Promise.all([
      mod.hasHardwareAsync(),
      mod.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/**
 * Show the device unlock prompt. Returns true when the worker passed.
 *
 * `disableDeviceFallback` is left false so a failed fingerprint falls
 * back to the device PIN / pattern — exactly the "fingerprint, pattern
 * or digit lock" the worker already uses.
 *
 * If the native module is missing entirely we return true (pass) — a
 * missing module must never lock a worker out of their own app.
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  const mod = await getModule();
  if (!mod) return true;
  try {
    const result = await mod.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success === true;
  } catch {
    return false;
  }
}
