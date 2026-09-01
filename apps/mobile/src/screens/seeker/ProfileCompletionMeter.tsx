/**
 * ProfileCompletionMeter — a small horizontal bar on the seeker's
 * Profile that shows their completion % with a one-line nudge for the
 * next missing piece.
 *
 *   ████████░░░░░░░░  68%
 *   Next: Add work photos · +15
 *
 * Hidden when the profile is 100% complete so it doesn't take up space.
 * Tapping a nudge deep-links into the right edit section.
 */
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import {
  computeCompleteness,
  type ProfileCheckItem,
} from '@/lib/profileCompleteness';
import type { PublicUser } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Props {
  user: PublicUser | null;
}

export function ProfileCompletionMeter({ user }: Props) {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { score, next } = computeCompleteness(user);

  if (score >= 100 || !next) return null;

  function navigateForNudge(item: ProfileCheckItem) {
    haptic('selection');
    switch (item.id) {
      case 'photo':
      case 'bio':
        return navigation.navigate('EditProfile', { section: 'basics' });
      case 'phone':
        return navigation.navigate('AddRecoveryPhone');
      case 'verified':
        return navigation.navigate('Verification');
      case 'skills':
        return navigation.navigate('EditProfile', { section: 'skills' });
      case 'expectedSalary':
        return navigation.navigate('EditExpectedSalary');
      case 'workHistory':
      case 'workPhotos':
        return navigation.navigate('ResumeBuilder');
      case 'location':
        return navigation.navigate('EditProfile', { section: 'location' });
    }
  }

  // Color the bar warmer as % increases — gives a sense of progress.
  const fill =
    score < 33 ? theme.warning : score < 66 ? theme.brand.primary : theme.success;

  return (
    <Pressable
      onPress={() => navigateForNudge(next)}
      style={({ pressed }) => ({
        padding: spacing.lg,
        borderRadius: 16,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
          Profile completeness
        </Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: fill }}>
          {score}%
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.bg.muted,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${score}%`,
            height: '100%',
            backgroundColor: fill,
          }}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text.primary }}>
            Next: {next.label}
          </Text>
          <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 2 }}>
            {next.subtitle}
          </Text>
        </View>
        <Text style={{ color: theme.brand.primary, fontWeight: '700', fontSize: 12 }}>
          +{next.weight}% →
        </Text>
      </View>
    </Pressable>
  );
}
