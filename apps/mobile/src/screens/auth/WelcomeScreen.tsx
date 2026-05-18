import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';
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
  const t = useTranslate();

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
            {t('auth.welcome.eyebrow')}
          </Text>
          <Text variant="displayLarge" weight="medium" display>
            {t('auth.welcome.hero')}
          </Text>
          <Text variant="bodyLarge" tone="secondary" style={{ marginTop: spacing.sm }}>
            {t('auth.welcome.tagline')}
          </Text>
        </View>

        {/* CTAs */}
        <View style={{ gap: spacing.md }}>
          <Button label={t('auth.welcome.cta_create')} onPress={() => navigation.navigate('Signup')} />
          <Button
            label={t('auth.welcome.cta_have_account')}
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
          />
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: spacing.sm }}>
            {t('auth.welcome.terms')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
