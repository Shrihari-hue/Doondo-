/**
 * FestivalBanner — Festival Mode's Home-screen surface.
 *
 * Self-hiding: renders nothing outside a festival window. During a
 * window it shows a themed greeting; in the ~12 days before one it
 * shows a countdown ("Diwali in 3 days") to build anticipation. Either
 * way it taps through to the festival job board. Accent colors come
 * from the server's festival config, so the banner re-skins per
 * festival without an app theme change.
 */
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { useFestivalState } from '@/lib/festivals';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

export function FestivalBanner() {
  const state = useFestivalState();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const t = useTranslate();

  const active = state?.active ?? null;
  const upcoming = state?.upcoming ?? null;
  // Prefer the active festival; otherwise count down to the next one.
  const festival = active ?? upcoming?.festival ?? null;
  if (!festival) return null;

  const isCountdown = !active && upcoming !== null;
  const title = isCountdown
    ? t('festival.countdown', {
        festival: festival.name,
        days: upcoming!.daysUntil,
      })
    : t('festival.greeting', { festival: festival.name });
  const sub = isCountdown
    ? t('festival.countdown_sub')
    : t('festival.banner_sub');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        haptic('selection');
        navigation.navigate('FestivalJobs');
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: festival.accentSoft,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: festival.accent,
        padding: 14,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 24 }}>{festival.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: festival.accent }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.secondary, marginTop: 1 }}>
          {sub}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: festival.accent }}>
        {t('festival.banner_cta')} →
      </Text>
    </Pressable>
  );
}
