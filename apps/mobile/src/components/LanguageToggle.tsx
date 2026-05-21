/**
 * LanguageToggle — a globe button that opens the language picker.
 *
 * Dropped into screen headers so switching language is never more than
 * one tap away — a worker who picked the wrong language at signup, or
 * who shares a phone, doesn't have to dig through Settings to fix it.
 *
 * Self-contained: it owns its own sheet visibility state and reads the
 * locale through the LanguageProvider, so mounting it anywhere is just
 * `<LanguageToggle />` — no props, no wiring.
 *
 * Two looks:
 *   - `default` — a surface-coloured circle, for light/canvas headers.
 *   - `onDark`  — a translucent-white circle, for the coloured gradient
 *     hero on the Profile screen.
 */

import { useState } from 'react';
import { Pressable, Text as RNText } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { LanguagePickerSheet } from './LanguagePickerSheet';

interface Props {
  /** `onDark` for coloured headers (Profile hero); `default` otherwise. */
  variant?: 'default' | 'onDark';
}

export function LanguageToggle({ variant = 'default' }: Props) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const onDark = variant === 'onDark';

  return (
    <>
      <Pressable
        onPress={() => {
          haptic('light');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('language.toggle_a11y')}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: onDark ? 'rgba(255,255,255,0.18)' : theme.bg.surface,
          borderWidth: 0.5,
          borderColor: onDark ? 'rgba(255,255,255,0.32)' : theme.border.default,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <RNText style={{ fontSize: 20 }}>🌐</RNText>
      </Pressable>
      <LanguagePickerSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
