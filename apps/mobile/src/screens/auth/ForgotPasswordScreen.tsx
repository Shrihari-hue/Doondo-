import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Card } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

/**
 * ForgotPasswordScreen — placeholder until the email service lands (Phase 5).
 *
 * The full flow needs:
 *   1. POST /api/v1/auth/forgot-password { email } → backend mints a one-time
 *      reset token and emails a deep link.
 *   2. Deep link opens ResetPassword screen with token in params.
 *   3. POST /api/v1/auth/reset-password { token, newPassword } → backend
 *      validates and updates.
 *
 * Until the email service exists, we show this honest placeholder rather
 * than ship a button that does nothing.
 */
export function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['4xl'],
          gap: spacing['2xl'],
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            FORGOT PASSWORD
          </Text>
          <Text variant="titleLarge" weight="medium">
            We'll have this soon
          </Text>
        </View>

        <Card>
          <Text variant="body" tone="secondary">
            Password reset by email is coming with our notifications layer. For
            now, message support and we'll reset your password manually within
            an hour.
          </Text>
        </Card>

        <View style={{ gap: spacing.md }}>
          <Button label="Back to sign in" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </Screen>
  );
}
