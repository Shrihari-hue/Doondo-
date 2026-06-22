/**
 * BlurOverlay — frosted-glass backdrop for bottom sheets and modals.
 *
 * Uses expo-blur's BlurView on iOS/Android and falls back to a
 * semi-transparent View on web or when blur is unavailable.
 */

import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export function BlurOverlay({ children, style, intensity = 40 }: Props) {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[{ flex: 1 }, style]}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
    >
      {children}
    </BlurView>
  );
}
