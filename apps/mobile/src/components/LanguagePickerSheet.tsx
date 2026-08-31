/**
 * LanguagePickerSheet — bottom sheet for switching the app language.
 *
 * Five rows, one per supported locale, each self-labelled in its own
 * script ("English", "हिन्दी (Hindi)", "ಕನ್ನಡ (Kannada)", …). That
 * self-labelling is the whole point: a worker stranded in a language
 * they can't read can still recognise their own and tap out.
 *
 * Picking a language calls the LanguageProvider's `setLocale`, which
 * persists the choice to secure-store and re-renders the whole app
 * tree with the new language pack — the switch is instant.
 *
 * Rendered via react-native's built-in <Modal> as a bottom sheet,
 * mirroring AccountSwitcherSheet so the two feel like siblings.
 */

import { Modal, Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useLocale } from '@/i18n/LanguageProvider';
import { useTranslate } from '@/i18n/useTranslate';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePickerSheet({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useTranslate();

  function pick(code: SupportedLocale) {
    haptic('selection');
    // Fire-and-forget — setLocale persists + re-renders via the provider.
    if (code !== locale) void setLocale(code).catch(() => undefined);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop — tap to dismiss */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Sheet body — stops bubbling so taps inside don't dismiss */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.bg.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing['2xl'],
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.default,
              marginBottom: spacing.lg,
            }}
          />

          {/* Title */}
          <View
            style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm, gap: 2 }}
          >
            <Text variant="bodyLarge" weight="medium">
              {t('language.title')}
            </Text>
            <Text variant="footnote" tone="secondary">
              {t('language.subtitle')}
            </Text>
          </View>

          {/* Language rows */}
          <View>
            {SUPPORTED_LOCALES.map((code) => {
              const active = code === locale;
              return (
                <Pressable
                  key={code}
                  onPress={() => pick(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                      gap: spacing.md,
                    }}
                  >
                    <Text
                      variant="bodyLarge"
                      weight={active ? 'medium' : 'regular'}
                      style={{ flex: 1 }}
                    >
                      {LOCALE_LABELS[code]}
                    </Text>
                    {active && (
                      <Text
                        variant="bodyLarge"
                        weight="medium"
                        style={{ color: theme.brand.primary }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
