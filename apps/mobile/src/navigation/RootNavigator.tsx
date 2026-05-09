import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { spacing } from '@doondo/tokens';

/**
 * RootNavigator — picks which stack to mount based on auth status.
 *
 *   bootstrapping → branded splash with spinner (we're checking the keychain)
 *   unauthenticated → AuthNavigator (Welcome / Login / Signup / Forgot)
 *   authenticated → AppNavigator (Home and beyond)
 *
 * Switching stacks unmounts the previous one entirely. That's intentional:
 * we never want a stale auth screen lurking under the app, and vice versa.
 */
export function RootNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) return <BootSplash />;

  return isAuthenticated ? <AppNavigator /> : <AuthNavigator />;
}

function BootSplash() {
  const { theme } = useTheme();
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
    </View>
  );
}
