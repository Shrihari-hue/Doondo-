/**
 * AuroraBackground — the atmospheric layer behind the role picker.
 *
 * Three stacked layers, all `pointerEvents="none"` so they never block taps:
 *
 *   1. Aurora — four enormous, soft, drifting color blobs (coral, jade,
 *      champagne) that slowly translate across the screen on independent
 *      loops. They overlap and blend, creating ever-changing pools of
 *      ambient color — like a far-off city skyline glow at night.
 *
 *      The seeker / employer blobs also brighten when their side is
 *      selected and dim when the other side is selected, so the screen
 *      reacts to the tap as one coherent surface.
 *
 *   2. Stars — ~22 tiny champagne dots scattered across the canvas, each
 *      twinkling on its own slow random rhythm. Adds a feeling of depth
 *      without ever announcing itself.
 *
 *   3. Vignette — top and bottom dark gradients to focus attention on
 *      the middle of the screen and frame the orbs.
 *
 * No SVG, no Skia. The aurora "blobs" are five concentric translucent
 * circles whose composite reads as a soft radial gradient. Cheap to
 * render and identical on iOS / Android.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { coral, jade, champagne } from '@doondo/tokens';

// Soft radial-gradient PNG (white center → transparent edges, Gaussian falloff).
// Tinted per-blob with `tintColor`. Avoids the visible-rings artifact you get
// when faking radial gradients with stacked Views.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BLOB_SOFT = require('../../../../assets/images/blob-soft.png');

interface Props {
  /** Which role (if any) is currently selected. Drives blob brightness. */
  selected: 'seeker' | 'employer' | null;
}

export function AuroraBackground({ selected }: Props) {
  const { width, height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Drifting aurora blobs — order matters: warm tones underneath,
          cooler accents on top, so the warm side always feels closer. */}
      <AuroraBlob
        color={champagne[400]}
        size={620}
        startX={width * 0.15}
        startY={height * 0.18}
        driftX={[-30, 40]}
        driftY={[-25, 35]}
        durationMs={22000}
        baseAlpha={0.6}
        side={null}
        selected={selected}
      />
      <AuroraBlob
        color={coral[500]}
        size={680}
        startX={width * 0.2}
        startY={height * 0.55}
        driftX={[-20, 50]}
        driftY={[-40, 25]}
        durationMs={18000}
        baseAlpha={0.85}
        side="seeker"
        selected={selected}
      />
      <AuroraBlob
        color={jade[500]}
        size={680}
        startX={width * 0.78}
        startY={height * 0.5}
        driftX={[-50, 25]}
        driftY={[-30, 45]}
        durationMs={20000}
        baseAlpha={0.85}
        side="employer"
        selected={selected}
      />
      <AuroraBlob
        color={coral[600]}
        size={520}
        startX={width * 0.55}
        startY={height * 0.85}
        driftX={[-40, 30]}
        driftY={[-30, 20]}
        durationMs={26000}
        baseAlpha={0.45}
        side={null}
        selected={selected}
      />

      {/* Star field — overlays aurora, very subtle */}
      <StarField count={22} />

      {/* Vignette — darker at top and bottom edges */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(12,10,14,0.85)', 'rgba(12,10,14,0)']}
        style={[StyleSheet.absoluteFillObject, { height: height * 0.35 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(12,10,14,0)', 'rgba(12,10,14,0.9)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * 0.4,
        }}
      />
    </View>
  );
}

// ─── Aurora blob ─────────────────────────────────────────────────────────────

interface BlobProps {
  color: string;
  size: number;
  startX: number;
  startY: number;
  driftX: [number, number];
  driftY: [number, number];
  durationMs: number;
  /** Peak opacity of the blob (0..1). */
  baseAlpha: number;
  /**
   * Which role this blob is associated with — if non-null, it brightens
   * when that role is selected and dims when the other role is selected.
   * Champagne / coral-bottom blobs use null (they just breathe ambient).
   */
  side: 'seeker' | 'employer' | null;
  selected: 'seeker' | 'employer' | null;
}

function AuroraBlob({
  color,
  size,
  startX,
  startY,
  driftX,
  driftY,
  durationMs,
  baseAlpha,
  side,
  selected,
}: BlobProps) {
  const drift = useRef(new Animated.Value(0)).current;
  const intensity = useRef(new Animated.Value(baseAlpha)).current;

  // Slow, lazy drift loop — one full cycle of out-and-back over `durationMs`.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, durationMs]);

  // React to selection — brighten this blob if its side is selected,
  // dim if the other side is selected, neutral baseline otherwise.
  useEffect(() => {
    let target = baseAlpha;
    if (side !== null) {
      if (selected === side) target = Math.min(1, baseAlpha * 1.6);
      else if (selected !== null) target = baseAlpha * 0.4;
    }
    Animated.timing(intensity, {
      toValue: target,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selected, side, baseAlpha, intensity]);

  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: driftX,
  });
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: driftY,
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: startX - size / 2,
        top: startY - size / 2,
        width: size,
        height: size,
        opacity: intensity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Image
        source={BLOB_SOFT}
        // tintColor recolors the white-on-transparent gradient to the brand
        // color while preserving the smooth alpha falloff.
        style={{ width: '100%', height: '100%', tintColor: color }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ─── Star field ──────────────────────────────────────────────────────────────

interface StarFieldProps {
  count: number;
}

function StarField({ count }: StarFieldProps) {
  const { width, height } = useWindowDimensions();

  // Generate star positions / sizes / phases ONCE per mount. We use a
  // simple seeded pseudo-random so positions are stable while the
  // component lives — re-randomising on every render would jitter.
  const stars = useMemo(() => {
    const out: Array<{
      x: number;
      y: number;
      size: number;
      duration: number;
      delay: number;
    }> = [];
    let seed = 1337;
    const rand = () => {
      // tiny LCG — we don't need cryptographic randomness here
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      out.push({
        x: rand() * width,
        y: rand() * height,
        size: 1 + rand() * 1.6,
        duration: 1800 + rand() * 2400,
        delay: rand() * 2000,
      });
    }
    return out;
  }, [count, width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Star key={i} {...s} />
      ))}
    </View>
  );
}

interface StarProps {
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

function Star({ x, y, size, duration, delay }: StarProps) {
  const opacity = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, duration, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: champagne[200],
        opacity,
      }}
    />
  );
}
