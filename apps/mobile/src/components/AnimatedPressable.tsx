/**
 * AnimatedPressable — drop-in Pressable replacement with spring scale feedback.
 *
 * Scales to 0.96 on press via Animated.spring, giving a tactile physical feel.
 * All standard Pressable props are forwarded.
 *
 * Uses Animated.createAnimatedComponent(Pressable) so ALL style properties
 * (position, flexDirection, backgroundColor, etc.) work correctly without a
 * wrapper View that would interfere with layout.
 */

import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useRef } from 'react';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleValue?: number;
}

export function AnimatedPressable({ children, style, scaleValue = 0.96, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn(e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
    onPressIn?.(e);
  }

  function handlePressOut(e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
    onPressOut?.(e);
  }

  // Merge the caller's style with the scale transform.
  // Function-style is resolved at render with pressed=false for the transform
  // layer; the Pressable still receives the original function for its own
  // press-state logic (e.g. opacity changes).
  const animatedStyle =
    typeof style === 'function'
      ? (state: { pressed: boolean }) => [style(state), { transform: [{ scale }] }]
      : [style, { transform: [{ scale }] }];

  return (
    <AnimatedPressableBase
      style={animatedStyle as StyleProp<ViewStyle>}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
