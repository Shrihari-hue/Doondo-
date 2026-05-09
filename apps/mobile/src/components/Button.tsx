import { Pressable, type PressableProps } from 'react-native';
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
}

/**
 * Button — the only way to render a tappable CTA in Doondo.
 *
 * Variants:
 *   - primary  → coral hero CTA. The "do the thing" button.
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
  onPress,
  ...rest
}: Props) {
  const { theme } = useTheme();

  const variantMap = {
    primary: {
      bg: theme.brand.hero,
      bgPressed: theme.brand.heroPressed,
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
      style={({ pressed }) => ({
        backgroundColor: pressed && !disabled ? v.bgPressed : v.bg,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: v.borderColor,
        paddingVertical: s.paddingV,
        paddingHorizontal: s.paddingH,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text variant={s.textVariant} weight="medium" tone={v.tone}>
        {label}
      </Text>
    </Pressable>
  );
}
