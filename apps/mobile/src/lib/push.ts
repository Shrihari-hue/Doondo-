/**
 * push — Expo push token registration + tap handler wiring.
 *
 * Lifecycle:
 *   1. After the user is authenticated, registerForPushNotifications()
 *      requests permission, fetches the Expo token, and POSTs it to the
 *      backend. Idempotent (backend $addToSet de-dupes).
 *   2. setupNotificationHandlers() configures Android channels and
 *      controls how notifications behave when the app is foregrounded
 *      (we let them show as a banner — premium feel).
 *   3. attachTapHandler(navigate) wires the tap-to-deep-link logic. The
 *      caller passes a navigator-aware handler so this module stays free
 *      of react-navigation imports.
 *
 * Important: every entry point dynamically imports `expo-notifications`
 * INSIDE the function, after the IS_EXPO_GO check. The static import
 * loads the native module at module-load time, which itself emits the
 * "remote notifications removed in Expo Go" warning even if no API is
 * called. Lazy-importing keeps the console clean during dev.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { meApi } from '@/api/me.api';

let cachedToken: string | null = null;

/**
 * Expo Go SDK 53+ removed remote push on Android, and emits noisy
 * warnings on iOS too. Detect that environment and short-circuit so the
 * console stays clean during dev. Real push lights up automatically the
 * moment we move to a development build.
 */
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// ─── Foreground behavior — show notifications as banners ────────────────────

export async function setupNotificationHandlers(): Promise<void> {
  if (IS_EXPO_GO) return;
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    // Group by purpose so users can mute one stream without losing others.
    void Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    void Notifications.setNotificationChannelAsync('chat', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 200, 100, 200],
    });
    void Notifications.setNotificationChannelAsync('applications', {
      name: 'Application updates',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

// ─── Token registration ─────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  // Expo Go on SDK 53+ has remote push removed (Android) and degraded
  // (iOS). Bail silently — push lights up the moment we ship a dev build.
  if (IS_EXPO_GO) return null;

  // Lazy imports so the native modules don't load until we know we're
  // in an environment that supports them.
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);

  // Simulators / web — push doesn't work. Skip silently.
  if (!Device.isDevice) return null;

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted && settings.canAskAgain) {
    const ask = await Notifications.requestPermissionsAsync();
    granted = ask.granted;
  }
  if (!granted) return null;

  try {
    // The projectId is required by Expo SDK 49+ for token issuance.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    cachedToken = tokenResponse.data;

    // Best-effort upload — never block auth flow on this.
    void meApi.registerPushToken(cachedToken).catch(() => undefined);
    return cachedToken;
  } catch {
    // No project configured (Expo Go without dev client) — skip.
    return null;
  }
}

export async function getNotificationPermissionStatus(): Promise<
  'unknown' | 'granted' | 'denied' | 'unsupported'
> {
  if (IS_EXPO_GO) return 'unsupported';
  const Notifications = await import('expo-notifications');
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return 'granted';
  if (!settings.canAskAgain) return 'denied';
  return 'unknown';
}

export async function requestPushPermissionFromLanding(): Promise<
  'granted' | 'denied' | 'unsupported'
> {
  if (IS_EXPO_GO) return 'unsupported';
  const Notifications = await import('expo-notifications');
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return 'granted';
  if (!settings.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

export function getCachedPushToken(): string | null {
  return cachedToken;
}

export async function clearPushToken(): Promise<void> {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  await meApi.clearPushToken(token).catch(() => undefined);
}

// ─── Tap-to-navigate ────────────────────────────────────────────────────────

export interface PushDeepLink {
  type: 'chat:message_received' | 'application:status_changed' | string;
  conversationId?: string;
  applicationId?: string;
  status?: string;
}

/**
 * Subscribe to notification taps. The navigator-aware callback is invoked
 * with a parsed payload for "open chat / application from a tap".
 * Returns the unsubscribe function.
 */
export function attachTapHandler(
  onTap: (link: PushDeepLink) => void,
): () => void {
  if (IS_EXPO_GO) return () => undefined;

  // We need a synchronous return for the unsubscribe contract — wire up
  // the listener in a fire-and-forget async block, and surface the real
  // unsubscribe through a closure once it's ready.
  let dispose: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const Notifications = await import('expo-notifications');
    if (cancelled) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (
        data &&
        typeof data === 'object' &&
        'type' in data &&
        typeof data.type === 'string'
      ) {
        onTap(data as unknown as PushDeepLink);
      }
    });
    dispose = () => sub.remove();
  })();

  return () => {
    cancelled = true;
    if (dispose) dispose();
  };
}
