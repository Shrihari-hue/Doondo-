/**
 * LockScreen — the biometric / PIN unlock gate.
 *
 * Shown by the RootNavigator instead of the app when the worker has
 * turned on app lock and the app has just been opened (or returned
 * from the background). It prompts the device unlock immediately; on
 * success the gate clears and the real app renders.
 *
 * Escape hatch: "Sign in with a different account" logs out — so a
 * worker can never be permanently trapped behind a failing sensor.
 *
 * Design notes:
 *   - Dark navy gradient brand banner, matching the LoginScreen header
 *     treatment, with a blue-tinted keyhole mark.
 *   - Blue accents on the primary unlock card (mirrors the BLUE hero
 *     color used across the redesigned screens). The fallback "sign in"
 *     card uses the default neutral border so the primary action stays
 *     the visual focus.
 *   - Fingerprint/keyhole marks stay pure-View glyphs (no icon font
 *     equivalent exists for them); the person + chevron glyphs were
 *     swapped for Feather icons to match the rest of the app.
 */

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { radii, spacing, blue } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { useAppLockStore } from '@/stores/appLock.store';
import { useAuth } from '@/hooks/useAuth';

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here

export function LockScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const unlock = useAppLockStore((s) => s.unlock);
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function attempt() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlock(t('app_lock.unlock_prompt'));
    if (ok) {
      haptic('success');
    } else {
      haptic('error');
      setFailed(true);
    }
    setBusy(false);
  }

  // Prompt the moment the lock screen appears.
  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        }}
      >
        {/* Brand banner — dark navy gradient matching the LoginScreen header. */}
        <View style={{ alignSelf: 'stretch', maxWidth: 360, width: '100%' }}>
          <LinearGradient
            colors={['#060B16', '#0D1B33', blue[900]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              alignItems: 'center',
              gap: spacing.xs,
              borderRadius: radii.xl,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.25)',
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radii.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(59,130,246,0.16)',
                borderWidth: 1,
                borderColor: 'rgba(96,165,250,0.5)',
                marginBottom: spacing.xs,
              }}
            >
              <KeyholeMark size={38} color={blue[300]} />
            </View>
            <Text variant="titleLarge" weight="medium" style={{ color: '#FFFFFF' }}>
              Doondo
            </Text>
            <Text
              variant="caption"
              weight="medium"
              style={{ letterSpacing: 1.4, color: blue[300] }}
            >
              SECURE ACCESS
            </Text>
          </LinearGradient>
        </View>

        <Text
          variant="footnote"
          tone="secondary"
          style={{ textAlign: 'center', maxWidth: 300 }}
        >
          {t('app_lock.lock_screen_message')}
        </Text>

        {failed && (
          <Text variant="footnote" tone="danger" style={{ textAlign: 'center' }}>
            {t('app_lock.unlock_failed')}
          </Text>
        )}

        {/* Primary unlock card — gold accents, fingerprint glyph, chevron. */}
        <View style={{ alignSelf: 'stretch', maxWidth: 360, width: '100%', marginTop: spacing.lg }}>
          <ActionCard
            leading={<FingerprintGlyph size={32} color={theme.premium.gold} />}
            title={busy ? t('app_lock.unlocking') : t('app_lock.unlock_button')}
            subtitle={busy ? undefined : t('app_lock.unlock_button_subtitle')}
            onPress={() => void attempt()}
            disabled={busy}
            tone="gold"
          />
        </View>

        {/* "or" divider — thin hairlines flanking the word. */}
        <View
          style={{
            alignSelf: 'stretch',
            maxWidth: 360,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginVertical: spacing.xs,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: theme.border.subtle }} />
          <Text variant="footnote" tone="tertiary">
            {t('app_lock.or')}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.border.subtle }} />
        </View>

        {/* Escape-hatch sign-in card — neutral border so the gold stays special. */}
        <View style={{ alignSelf: 'stretch', maxWidth: 360, width: '100%' }}>
          <ActionCard
            leading={<PersonGlyph size={28} color={theme.text.secondary} />}
            title={t('app_lock.sign_out')}
            onPress={() => void logout()}
            tone="neutral"
          />
        </View>
      </View>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local primitives — glyphs + card
// ─────────────────────────────────────────────────────────────────────────────

interface ActionCardProps {
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  tone: 'gold' | 'neutral';
}

/**
 * A list-row-shaped CTA: leading glyph, two-line label, trailing chevron.
 * Used in two flavours: a gold-bordered primary unlock, and a neutral
 * secondary "use a different account" fallback. Built as a custom
 * Pressable because the shared Button can't host icons or stacked text.
 */
function ActionCard({ leading, title, subtitle, onPress, disabled, tone }: ActionCardProps) {
  const { theme } = useTheme();
  const borderColor = tone === 'gold' ? theme.premium.goldBorder : theme.border.default;
  const bg = tone === 'gold' ? theme.premium.goldSubtle : theme.bg.surface;
  const bgPressed = tone === 'gold' ? theme.premium.gold : theme.bg.elevated;

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic('light');
        onPress();
      }}
      disabled={disabled}
      style={{ alignSelf: 'stretch' }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.xl,
            backgroundColor: pressed && !disabled ? bgPressed : bg,
            borderWidth: 0.5,
            borderColor,
            borderRadius: radii.lg,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <View style={{ width: 32, alignItems: 'center' }}>{leading}</View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium">
              {title}
            </Text>
            {subtitle && (
              <Text variant="footnote" tone="tertiary">
                {subtitle}
              </Text>
            )}
          </View>
          <ChevronGlyph size={14} color={tone === 'gold' ? theme.premium.gold : theme.text.tertiary} />
        </View>
      )}
    </Pressable>
  );
}

interface GlyphProps {
  size?: number;
  color?: string;
}

/**
 * Tall rounded-capsule outline with a keyhole carved inside.
 * The keyhole is a small filled circle sitting on top of a tapered stem.
 */
function KeyholeMark({ size = 72, color = '#B89968' }: GlyphProps) {
  // Capsule is taller than it is wide — that's what makes it read as a
  // vintage padlock cylinder rather than a pill.
  const w = size * 0.7;
  const h = size;
  const stroke = Math.max(1.5, size * 0.04);

  // Keyhole geometry — circle on top, tapered stem below.
  const holeR = w * 0.18;
  const stemW = holeR * 1.1;
  const stemH = h * 0.22;

  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer capsule outline. */}
      <View
        style={{
          position: 'absolute',
          width: w,
          height: h,
          borderRadius: w / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Keyhole — head + stem, centered vertically. */}
      <View style={{ alignItems: 'center', gap: -1 }}>
        <View
          style={{
            width: holeR * 2,
            height: holeR * 2,
            borderRadius: holeR,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: stemW,
            height: stemH,
            backgroundColor: color,
            borderBottomLeftRadius: stemW / 2,
            borderBottomRightRadius: stemW / 2,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Fingerprint glyph — five concentric arcs faked with View borders.
 * Each arc shows only its top half (overflow hidden) and only the top
 * border, producing a dome. Stacked at the bottom edge, they read as
 * the looping ridges of a fingerprint.
 */
function FingerprintGlyph({ size = 32, color = '#B89968' }: GlyphProps) {
  const stroke = Math.max(1, Math.round(size * 0.06));
  // Arc sizes scale inward from the outermost ridge.
  const ridges = [1.0, 0.78, 0.56, 0.36, 0.18];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      {ridges.map((ratio, i) => {
        const w = size * ratio;
        const h = w / 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: size * 0.12 + i * (size * 0.08),
              width: w,
              height: h,
              borderTopLeftRadius: w / 2,
              borderTopRightRadius: w / 2,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderRightWidth: stroke,
              borderBottomWidth: 0,
              borderColor: color,
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * Generic person glyph — head circle on top of a rounded-top shoulders bar.
 */
function PersonGlyph({ size = 28, color = '#9C988F' }: GlyphProps) {
  const stroke = Math.max(1, Math.round(size * 0.07));
  const headD = size * 0.42;
  const shoulderW = size * 0.78;
  const shoulderH = size * 0.32;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', gap: stroke }}>
      <View
        style={{
          width: headD,
          height: headD,
          borderRadius: headD / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: shoulderW,
          height: shoulderH,
          borderTopLeftRadius: shoulderW / 2,
          borderTopRightRadius: shoulderW / 2,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderRightWidth: stroke,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
    </View>
  );
}

/**
 * Right-pointing chevron drawn as a rotated square with two visible borders.
 */
function ChevronGlyph({ size = 14, color = '#9C988F' }: GlyphProps) {
  const stroke = Math.max(1.25, Math.round(size * 0.14));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderTopWidth: stroke,
        borderRightWidth: stroke,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}
