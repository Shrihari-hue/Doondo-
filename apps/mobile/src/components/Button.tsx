import { Pressable, View, type PressableProps } from 'react-native';
import type { ReactNode } from 'react';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'premium' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  size?: Size;
  /** Stretches to fill the parent's width. Default true. */
  fullWidth?: boolean;
  /** Disables and dims the button; haptic + onPress are skipped. */
  disabled?: boolean;
  /**
   * Leading icon, rendered with an 8px gap before the label — the
   * "Icon — 8px gap — Text" pattern from design/components.md's
   * PrimaryButton spec. Pass a sized icon element (e.g. a Feather icon);
   * this component doesn't own icon color/size, so match `tone`'s color
   * yourself for a consistent look.
   */
  icon?: ReactNode;
}

/**
 * Button — the only way to render a tappable CTA in Doondo.
 *
 * Variants:
 *   - primary  → blue primary CTA. The "do the thing" button.
 *   - secondary → surface-colored card-like button. Save, cancel, secondary actions.
 *   - ghost    → minimal, used for tertiary actions ("Skip", "Learn more").
 *   - premium  → champagne-tinted, used to highlight upgrade or premium-tier CTAs.
 *   - danger   → destructive (delete account, leave conversation).
 *
 * Always triggers a 'light' haptic on press. If you need a different intent,
 * use a custom Pressable.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  icon,
  onPress,
  ...rest
}: Props) {
  const { theme } = useTheme();

  const variantMap = {
    primary: {
      bg: theme.brand.primary,
      bgPressed: theme.brand.primaryPressed,
      borderColor: 'transparent',
      tone: 'onBrand' as const,
    },
    secondary: {
      bg: theme.bg.surface,
      bgPressed: theme.bg.elevated,
      borderColor: theme.border.default,
      tone: 'primary' as const,
    },
    ghost: {
      bg: 'transparent',
      bgPressed: theme.bg.muted,
      borderColor: theme.border.subtle,
      tone: 'primary' as const,
    },
    premium: {
      bg: theme.premium.goldSubtle,
      bgPressed: theme.premium.gold,
      borderColor: theme.premium.goldBorder,
      tone: 'gold' as const,
    },
    danger: {
      bg: theme.status.dangerSubtle,
      bgPressed: theme.status.danger,
      borderColor: theme.status.dangerBorder,
      tone: 'danger' as const,
    },
  };

  const sizeMap = {
    sm: { paddingV: spacing.sm, paddingH: spacing.lg, textVariant: 'body' as const },
    md: { paddingV: spacing.md, paddingH: spacing.xl, textVariant: 'bodyLarge' as const },
    lg: { paddingV: spacing.lg, paddingH: spacing['2xl'], textVariant: 'title' as const },
  };

  const v = variantMap[variant];
  const s = sizeMap[size];

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={(e) => {
        if (disabled) return;
        haptic('light');
        onPress?.(e);
      }}
      // Only width-anchoring lives on the Pressable. All paint (background,
      // border, padding) sits on the static inner <View> below — RN drops
      // properties from a Pressable style *function* on some builds, which
      // was rendering this button as bare text with no background.
      style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }}
    >
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: pressed && !disabled ? v.bgPressed : v.bg,
            borderRadius: radii.button, // design/components.md PrimaryButton: 16px
            borderWidth: 0.5,
            borderColor: v.borderColor,
            paddingVertical: s.paddingV,
            paddingHorizontal: s.paddingH,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm, // design/components.md: "Icon — 8px gap — Text"
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {icon}
          {/* Indic-language labels for actions like "Apply Now" can be 1.5-2x
             longer than English (ಈಗ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ vs Apply Now). Let the label
             wrap to two lines and shrink to 85% so it never clips on the
             smallest devices in any of our supported languages. */}
          <Text
            variant={s.textVariant}
            weight="medium"
            tone={v.tone}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{ textAlign: 'center' }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
