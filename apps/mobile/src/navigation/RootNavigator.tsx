import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAppLockStore } from '@/stores/appLock.store';
import { useWomenModeStore } from '@/stores/womenMode.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { LockScreen } from '@/screens/LockScreen';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Text } from '@/components/Text';
import { useTranslate } from '@/i18n/useTranslate';
import { spacing } from '@doondo/tokens';

/**
 * RootNavigator — picks which stack to mount based on auth status.
 *
 *   bootstrapping → branded splash with spinner (we're checking the keychain)
 *   unauthenticated → AuthNavigator (Welcome / Login / Signup / Forgot)
 *   authenticated → AppNavigator (Home and beyond)
 *
 * On top of that sits the optional app-lock gate: when the worker has
 * turned on biometric / PIN lock, an authenticated session still has to
 * clear the LockScreen before the app renders. The lock re-engages
 * every time the app is sent to the background.
 *
 * Switching stacks unmounts the previous one entirely. That's intentional:
 * we never want a stale auth screen lurking under the app, and vice versa.
 */
export function RootNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const lockHydrated = useAppLockStore((s) => s.hydrated);
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const locked = useAppLockStore((s) => s.locked);

  useEffect(() => {
    // Load the lock preference once, and re-engage the lock whenever the
    // app leaves the foreground.
    void useAppLockStore.getState().hydrate();
    // Load the Women's Mode preference so the job feeds can filter on it.
    void useWomenModeStore.getState().hydrate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') useAppLockStore.getState().lock();
    });
    return () => sub.remove();
  }, []);

  // Hold on the splash until both auth bootstrap and the lock-preference
  // hydration finish — otherwise the app could flash before the lock.
  if (isBootstrapping || !lockHydrated) return <BootSplash />;

  if (!isAuthenticated) return <AuthNavigator />;
  if (lockEnabled && locked) return <LockScreen />;
  return <AppNavigator />;
}

function BootSplash() {
  const { theme } = useTheme();
  const t = useTranslate();
  // During an account switch the auth store sets this to the target
  // account's name, so the splash reads "Switching to …" instead of a
  // bare spinner — the worker knows what's happening, not just that the
  // app went blank.
  const { switchingToName } = useAuth();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
      }}
    >
      <Text variant="display" weight="medium" display>
        Doondo
      </Text>
      <LoadingSpinner />
      {switchingToName ? (
        <Text variant="footnote" tone="secondary">
          {t('account_switcher.switching_to', { name: switchingToName })}
        </Text>
      ) : null}
    </View>
  );
}
