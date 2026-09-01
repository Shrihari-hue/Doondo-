import { Linking, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, DoondoMark } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { resolveMediaUrl } from '@/api/client';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

/**
 * WelcomeScreen — the unauthenticated landing.
 *
 * In Phase 1.5 the role-picker 3D scene replaces this as the actual app
 * entry. For now we keep it minimal and elegant: a hero banner matching the
 * Login/Signup dark gradient treatment, and two buttons.
 */
export function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const t = useTranslate();

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['4xl'],
          paddingBottom: spacing['3xl'],
          justifyContent: 'space-between',
        }}
      >
        {/* Hero */}
        <LinearGradient
          colors={theme.brand.primaryBannerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            alignItems: 'center',
            gap: spacing.md,
            borderRadius: radii.xl,
            padding: spacing['2xl'],
            borderWidth: 1,
            borderColor: 'rgba(96,165,250,0.25)',
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(59,130,246,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.5)',
            }}
          >
            <DoondoMark size={40} color={theme.brand.primaryOnDark} />
          </View>

          <Text
            variant="caption"
            weight="medium"
            style={{ letterSpacing: 1.4, color: theme.brand.primaryOnDark, textAlign: 'center' }}
          >
            {t('auth.welcome.eyebrow')}
          </Text>
          <Text
            variant="display"
            weight="medium"
            display
            style={{ color: theme.text.onBrand, textAlign: 'center' }}
          >
            {t('auth.welcome.hero')}
          </Text>
          <Text
            variant="bodyLarge"
            style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: spacing.xs }}
          >
            {t('auth.welcome.tagline')}
          </Text>
        </LinearGradient>

        {/* CTAs */}
        <View style={{ gap: spacing.md }}>
          <Pressable
            onPress={() => {
              haptic('light');
              navigation.navigate('Signup');
            }}
          >
            <LinearGradient
              colors={theme.brand.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
              }}
            >
              <Text style={{ color: theme.text.onBrand, fontSize: 16, fontWeight: '700' }}>
                {t('auth.welcome.cta_create')}
              </Text>
              <Feather name="arrow-right" size={18} color={theme.text.onBrand} />
            </LinearGradient>
          </Pressable>
          <Button
            label={t('auth.welcome.cta_have_account')}
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
          />
          <Pressable
            onPress={() => {
              void Linking.openURL(resolveMediaUrl('/legal/') ?? 'https://doondo.app/legal/').catch(
                () => undefined,
              );
            }}
          >
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {t('auth.welcome.terms')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
