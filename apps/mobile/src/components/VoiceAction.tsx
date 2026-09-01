import { Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';

interface Props {
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  /**
   * Diameter in px. design/design.md §17: "Circular button, Orange,
   * Elevated, Centered on its navigation position." Default 56 — the
   * elevated-FAB size, raised above the tab bar row via marginBottom.
   */
  size?: number;
}

/**
 * VoiceAction — the one Voice nav button, shared by both the seeker and
 * employer tab bars so it's guaranteed pixel-identical (color, size,
 * elevation) between roles per design/design.md §17 and §23 ("every
 * component must define semantic tokens, not separate hard-coded
 * designs"). Each navigator keeps its own surrounding tab-row layout and
 * label — this owns just the circular action itself.
 */
export function VoiceAction({ onPress, onLongPress, accessibilityLabel, size = 56 }: Props) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic('medium');
        onPress();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.voice,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
        elevation: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Feather name="mic" size={Math.round(size * 0.43)} color={theme.text.onBrand} />
    </Pressable>
  );
}
