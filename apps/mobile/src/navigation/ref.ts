/**
 * navigationRef — imperative navigation handle for code outside the
 * React tree.
 *
 * Used by:
 *   - Push notification tap handler (mobile/src/lib/push.ts), which
 *     fires from an Expo Notifications listener that lives outside
 *     any screen component.
 *   - Future deep-link handlers (universal links, etc.) that need to
 *     route on app launch before the navigator has rendered.
 *
 * The ref is attached to <NavigationContainer ref={navigationRef}> in
 * App.tsx and exposes the minimum surface area: `navigate(name, params)`
 * with a runtime guard that drops the call if the navigator isn't
 * ready yet (e.g. a tap arriving during cold boot before the auth
 * stack has mounted).
 *
 * We deliberately use `createNavigationContainerRef<any>()` rather
 * than a typed param-list union because the tap handler routes
 * across both AuthStack and AppStack screens; constraining the type
 * here would force the caller to discriminate before navigating.
 * The screen name + params shape comes from the server via the push
 * data payload, so the navigator's own typed routes are the ones
 * that actually validate the call.
 */

import {
  createNavigationContainerRef,
  type ParamListBase,
} from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<ParamListBase>();

/**
 * Safe imperative navigate. No-ops when the navigator isn't ready,
 * so a push tap arriving on cold boot is silently dropped instead
 * of crashing.
 */
export function navigateFromExternal(
  screen: string,
  params?: Record<string, unknown>,
): void {
  if (!navigationRef.isReady()) return;
  // The cast is unavoidable here — see the comment at the top: we
  // accept any registered screen name + params object so the push
  // payload can route to any tab or modal.
  (navigationRef.navigate as (s: string, p?: Record<string, unknown>) => void)(
    screen,
    params,
  );
}
