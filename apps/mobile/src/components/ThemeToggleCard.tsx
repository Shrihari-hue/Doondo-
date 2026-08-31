/**
 * ThemeToggleCard — premium three-way appearance picker.
 *
 * Three segments: System / Dark / Light. The active segment fills with
 * the brand hero color and a champagne hairline; the others are flat.
 * Tap → setScheme / followSystem on the theme context. Persistence is
 * handled by ThemeProvider.
 *
 * Used in the seeker and employer Profile screens. Keep this component
 * presentational — anything user-facing should read its tone from the
 * theme so it works in both modes.
 */

import { Pressable, View } from 'react-native';
import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { Card } from './Card';
import { useTheme } from '@/theme/useTheme';

const OPTIONS = [
  { key: 'system', label: 'System', glyph: '◐' },
  { key: 'dark', label: 'Dark', glyph: '◌' },
  { key: 'light', label: 'Light', glyph: '☀' },
] as const;

type OptionKey = (typeof OPTIONS)[number]['key'];

export function ThemeToggleCard() {
  const { theme, scheme, isManual, setScheme, followSystem } = useTheme();

  // Resolve current selection: 'system' if not manual, else the active scheme.
  const active: OptionKey = !isManual ? 'system' : scheme;

  function onSelect(next: OptionKey) {
    if (next === 'system') followSystem();
    else setScheme(next);
  }

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            variant="footnote"
            weight="medium"
            tone="secondary"
            style={{ letterSpacing: 1.0 }}
          >
            APPEARANCE
          </Text>
          <Text variant="footnote" tone="tertiary">
            {active === 'system' ? `Auto · ${scheme}` : active}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.bg.muted,
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            padding: 4,
            gap: 4,
          }}
        >
          {OPTIONS.map((o) => {
            const isActive = active === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => onSelect(o.key)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.xs,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  backgroundColor: isActive ? theme.brand.primarySubtle : 'transparent',
                  borderWidth: isActive ? 0.5 : 0,
                  borderColor: theme.premium.hairline,
                }}
              >
                <Text
                  style={{
                    color: isActive ? theme.brand.primary : theme.text.tertiary,
                    fontSize: 14,
                  }}
                >
                  {o.glyph}
                </Text>
                <Text
                  variant="footnote"
                  weight={isActive ? 'medium' : 'regular'}
                  style={{
                    color: isActive ? theme.brand.primary : theme.text.secondary,
                  }}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Card>
  );
}
