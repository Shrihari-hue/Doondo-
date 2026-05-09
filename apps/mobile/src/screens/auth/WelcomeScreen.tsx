import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

/**
 * WelcomeScreen — the unauthenticated landing.
 *
 * In Phase 1.5 the role-picker 3D scene replaces this as the actual app
 * entry. For now we keep it minimal and elegant: a hero word, a tagline,
 * and two buttons.
 */
export function WelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['7xl'],
          paddingBottom: spacing['3xl'],
          justifyContent: 'space-between',
        }}
      >
        {/* Hero */}
        <View style={{ gap: spacing.md }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.4 }}>
            DOONDO
          </Text>
          <Text variant="displayLarge" weight="medium" display>
            Hire nearby.
          </Text>
          <Text variant="bodyLarge" tone="secondary" style={{ marginTop: spacing.sm }}>
            Doondo connects you with work in your city, area, and walking radius.
          </Text>
        </View>

        {/* CTAs */}
        <View style={{ gap: spacing.md }}>
          <Button label="Create your account" onPress={() => navigation.navigate('Signup')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
          />
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: spacing.sm }}>
            By continuing you agree to Doondo's Terms and Privacy Policy.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
