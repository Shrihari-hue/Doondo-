/**
 * SkeletonCard — pulsing placeholder that matches the JobCard silhouette.
 *
 * A subtle opacity pulse (0.45 ↔ 0.7) at ~1.4s cadence — never bright
 * enough to feel like a loading bar, just enough to signal "real content
 * is coming." Color follows theme.bg.muted so it sits gently on the canvas.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';

interface Props {
  /** How many lines of "text" to render. Default 3. */
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: Props) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.7] });

  const Bar = ({ width, height = 12 }: { width: string | number; height?: number }) => (
    <Animated.View
      style={{
        height,
        width: width as never,
        borderRadius: 4,
        backgroundColor: theme.bg.muted,
        opacity,
      }}
    />
  );

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Bar width="78%" height={14} />
          <Bar width="50%" />
        </View>
        <Bar width={56} height={20} />
      </View>
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Bar key={i} width={i % 2 === 0 ? '90%' : '70%'} />
      ))}
    </View>
  );
}
