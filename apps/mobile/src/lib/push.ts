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

/**
 * Re-verify the Expo push token when the app returns to the foreground.
 *
 * `registerForPushNotifications()` trusts its in-memory cache once set, so
 * within a single long-lived session (app backgrounded for days, never
 * fully relaunched) it would never notice if the underlying token rotated.
 * Expo's own docs call this out: "a push token may be changed by the push
 * notification service while the app is running." This always re-fetches
 * (bypassing the cache) and re-uploads only when the value actually
 * changed — cheap, and safe to call on every foreground transition.
 */
export async function refreshPushTokenOnForeground(): Promise<void> {
  if (IS_EXPO_GO) return;
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);
  if (!Device.isDevice) return;

  const settings = await Notifications.getPermissionsAsync();
  if (!settings.granted) return;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const fresh = tokenResponse.data;
    if (fresh === cachedToken) return;
    cachedToken = fresh;
    void meApi.registerPushToken(fresh).catch(() => undefined);
  } catch {
    // No project configured (Expo Go without dev client) — skip.
  }
}

export async function clearPushToken(): Promise<void> {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  await meApi.clearPushToken(token).catch(() => undefined);
}

// ─── Tap-to-navigate ────────────────────────────────────────────────────────

import { navigateFromExternal } from '@/navigation/ref';

/**
 * Resolve a push notification's `data` payload to a `(screen, params)`
 * call. Two shapes are accepted:
 *
 *   PREFERRED — `data.deeplink: { screen: string, params?: object }`
 *     Server-driven routing: the backend already knows where to send
 *     the user (it sets the same value on the in-app notification
 *     row), so the mobile just forwards.
 *
 *   LEGACY — `data.type: string` plus a few specific fields
 *     (applicationId, conversationId, jobId, alertId, courseId).
 *     Older push payloads still in flight use this. We map each
 *     known type to the screen/param shape the new code would have
 *     emitted, so a tap on a queued legacy push still lands on the
 *     right screen.
 *
 * Returns null when the payload doesn't carry enough info to route.
 */
function resolveDeeplinkFromData(
  data: Record<string, unknown> | null | undefined,
): { screen: string; params?: Record<string, unknown> } | null {
  if (!data || typeof data !== 'object') return null;

  // 1. Preferred path — server-set deeplink object.
  const deeplink = (data as { deeplink?: unknown }).deeplink;
  if (
    deeplink &&
    typeof deeplink === 'object' &&
    'screen' in deeplink &&
    typeof (deeplink as { screen: unknown }).screen === 'string'
  ) {
    const d = deeplink as { screen: string; params?: Record<string, unknown> };
    return {
      screen: d.screen,
      params:
        d.params && typeof d.params === 'object' ? d.params : undefined,
    };
  }

  // 2. Legacy path — map `type` → screen + params.
  const type = typeof (data as { type?: unknown }).type === 'string'
    ? (data as { type: string }).type
    : null;
  if (!type) return null;

  const applicationId =
    typeof (data as { applicationId?: unknown }).applicationId === 'string'
      ? (data as { applicationId: string }).applicationId
      : undefined;
  const conversationId =
    typeof (data as { conversationId?: unknown }).conversationId === 'string'
      ? (data as { conversationId: string }).conversationId
      : undefined;
  const jobId =
    typeof (data as { jobId?: unknown }).jobId === 'string'
      ? (data as { jobId: string }).jobId
      : undefined;
  const alertId =
    typeof (data as { alertId?: unknown }).alertId === 'string'
      ? (data as { alertId: string }).alertId
      : undefined;
  const courseId =
    typeof (data as { courseId?: unknown }).courseId === 'string'
      ? (data as { courseId: string }).courseId
      : undefined;

  switch (type) {
    case 'application:status_changed':
    case 'hire:celebration':
    case 'application:ghosted':
    case 'interview:scheduled':
    case 'interview:rescheduled':
    case 'interview:cancelled':
    case 'interview:reminder':
    case 'shift:check_in':
    case 'shift:check_out':
      return applicationId
        ? { screen: 'Applications', params: { applicationId } }
        : { screen: 'Applications' };
    case 'application:skill_gap':
      return courseId
        ? { screen: 'CourseDetail', params: { courseId } }
        : applicationId
          ? { screen: 'Applications', params: { applicationId } }
          : null;
    case 'chat:message_received':
      return conversationId
        ? { screen: 'Conversation', params: { conversationId } }
        : { screen: 'Chat' };
    case 'job:new':
    case 'job_alert:match':
      return jobId
        ? { screen: 'JobDetail', params: { jobId } }
        : { screen: 'Home' };
    case 'sos:alert':
      return alertId
        ? { screen: 'Sos', params: { alertId } }
        : { screen: 'Sos' };
    case 'rating:received':
      return { screen: 'Ratings' };
    case 'referral:bonus':
      return { screen: 'MyEarnings' };
    case 'streak:milestone':
      return { screen: 'Profile' };
    case 'morning_digest':
    case 'hired:nearby':
      return { screen: 'Home' };
    default:
      return null;
  }
}

/**
 * Subscribe to notification taps. The handler reads the `data` payload,
 * resolves a `(screen, params)` target, and navigates via the
 * imperative navigation ref so it works even when the tap arrives
 * outside any active screen (cold boot, backgrounded app).
 *
 * Returns an unsubscribe function. No-ops in Expo Go since push isn't
 * supported there.
 */
export function attachTapHandler(): () => void {
  if (IS_EXPO_GO) return () => undefined;

  let dispose: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const Notifications = await import('expo-notifications');
    if (cancelled) return;

    // Handle taps on a notification that fires while the app is alive.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | null;
        const target = resolveDeeplinkFromData(data);
        if (target) navigateFromExternal(target.screen, target.params);
      },
    );

    // Handle the cold-boot case: the user tapped a notification that
    // launched the app from killed state. `getLastNotificationResponse`
    // returns the response that triggered launch, if any.
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        const data = last.notification.request.content.data as
          | Record<string, unknown>
          | null;
        const target = resolveDeeplinkFromData(data);
        if (target) {
          // Small delay so the navigator has a chance to mount on
          // cold boot before we navigate.
          setTimeout(() => navigateFromExternal(target.screen, target.params), 400);
        }
      }
    } catch {
      // Older Expo SDKs may not have this API — silently skip.
    }

    dispose = () => responseSub.remove();
  })();

  return () => {
    cancelled = true;
    if (dispose) dispose();
  };
}
