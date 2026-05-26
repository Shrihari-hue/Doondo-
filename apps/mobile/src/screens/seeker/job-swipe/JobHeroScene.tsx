/**
 * JobHeroScene — the "photo strip" at the bottom of the swipe card.
 *
 * Why this exists:
 *   The reference comp shows a real stock photo (a car cruising into a
 *   misty skyline) anchored to the bottom of the Driver card. Shipping
 *   stock imagery per-trade would mean bundling ~30 JPEGs (one per slug)
 *   and re-licensing every time a trade is added. Instead we render an
 *   atmospheric, code-only scene that reads as "intentional artwork" at
 *   any size: a three-stop linear gradient evoking the trade's mood,
 *   plus the trade's MaterialCommunityIcons glyph rendered huge and
 *   semi-transparent, anchored to the bottom-right corner like a
 *   wallpaper motif. A soft horizon line sits behind the glyph so the
 *   scene reads as "ground + sky" the way the reference photo does.
 *
 * Tunable knobs:
 *   - `flavour.gradient`      controls the sky mood
 *   - `flavour.heroIconName`  is the wallpaper motif
 *   - `glyphTint`             overrides the motif color (defaults to a
 *                             very faded version of the gold accent so
 *                             it never competes with text above it).
 *
 * The component fills its parent — give it a fixed height in the card.
 */

import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/theme/useTheme';
import type { JobFlavour } from './jobFlavour';

interface Props {
  flavour: JobFlavour;
  /** Hex / rgba override for the giant glyph motif. */
  glyphTint?: string;
  /** Bottom rounding to match the parent card's radius. */
  bottomRadius?: number;
}

export function JobHeroScene({
  flavour,
  glyphTint,
  bottomRadius = 24,
}: Props) {
  const { theme } = useTheme();
  // Default tint: the brand champagne at very low opacity. Sits inside
  // the gradient as a watermark, never as the focal element.
  const tint = glyphTint ?? 'rgba(184, 153, 104, 0.22)';

  return (
    <View
      style={{
        flex: 1,
        overflow: 'hidden',
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius,
      }}
    >
      <LinearGradient
        // top → mid → bottom; bottom stop intentionally fades into the
        // card's surface so the scene doesn't hard-edge against the
        // "Tap to see details" pill that sits over it.
        colors={flavour.gradient}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ ...StyleSheetAbsolute, top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Soft horizon — a 0.5px line ~60% down that mimics where a real
          photo's horizon would sit. Pure decoration; no semantic weight. */}
      <View
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          top: '60%',
          height: 0.5,
          backgroundColor: theme.premium.goldBorder,
          opacity: 0.6,
        }}
      />

      {/* Wallpaper motif — anchored bottom-right, oversized, faded. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -24,
          bottom: -16,
        }}
      >
        <MaterialCommunityIcons
          name={flavour.heroIconName}
          size={220}
          color={tint}
        />
      </View>
    </View>
  );
}

// Re-usable absolute-fill literal so we don't pull in StyleSheet just
// for one object.
const StyleSheetAbsolute = { position: 'absolute' as const };
