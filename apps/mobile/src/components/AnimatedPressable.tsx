/**
 * AnimatedPressable — drop-in Pressable replacement with spring scale feedback.
 *
 * Scales to 0.96 on press via Animated.spring, giving a tactile physical feel.
 * All standard Pressable props are forwarded.
 */

import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useRef } from 'react';

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

  const resolvedStyle = typeof style === 'function'
    ? (state: { pressed: boolean }) => [{ transform: [{ scale }] }, style(state)]
    : [{ transform: [{ scale }] }, style];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={style}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
