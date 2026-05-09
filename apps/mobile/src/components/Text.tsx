import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import {
  fontSize,
  lineHeight,
  fontWeight,
  fontFamily,
  letterSpacing,
  type FontSizeKey,
} from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';

type Variant = FontSizeKey;
type Weight = 'regular' | 'medium' | 'semibold';
type Tone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'onBrand'
  | 'inverse'
  | 'hero'
  | 'gold'
  | 'success'
  | 'warning'
  | 'danger';

interface Props extends RNTextProps {
  /** Type-scale variant. Default 'body' (15px). */
  variant?: Variant;
  /** Weight. Default 'regular'. Three weights only — never reach for heavier. */
  weight?: Weight;
  /** Color intent — semantic, not a hex. */
  tone?: Tone;
  /** Use the editorial display font (tighter tracking, used for hero moments). */
  display?: boolean;
}

/**
 * Themed Text. Always reach for this instead of <Text> from react-native — it
 * handles the type scale, weight system, and theme-aware colors in one place.
 * If you need an off-palette color, pass `style={{ color: '...' }}` — but
 * 95% of the time tone={'...'} is what you want.
 */
export function Text({
  variant = 'body',
  weight = 'regular',
  tone = 'primary',
  display = false,
  style,
  ...rest
}: Props) {
  const { theme } = useTheme();

  const colorMap = {
    primary: theme.text.primary,
    secondary: theme.text.secondary,
    tertiary: theme.text.tertiary,
    disabled: theme.text.disabled,
    onBrand: theme.text.onBrand,
    inverse: theme.text.inverse,
    hero: theme.brand.hero,
    gold: theme.premium.gold,
    success: theme.status.success,
    warning: theme.status.warning,
    danger: theme.status.danger,
  } as const;

  // Display variants get tighter tracking for an editorial feel.
  const tracking =
    variant === 'displayLarge' || variant === 'display'
      ? letterSpacing.tight
      : letterSpacing.default;

  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: display ? fontFamily.display : fontFamily.sans,
          fontSize: fontSize[variant],
          lineHeight: Math.round(fontSize[variant] * lineHeight[variant]),
          fontWeight: fontWeight[weight],
          letterSpacing: tracking,
          color: colorMap[tone],
        },
        style,
      ]}
    />
  );
}
