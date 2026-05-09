import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';

type Edge = 'top' | 'bottom' | 'left' | 'right';

interface Props extends ViewProps {
  /** Which safe-area edges to inset. Default: top + bottom. */
  edges?: Edge[];
  /** Override the canvas background. Defaults to theme.bg.canvas. */
  background?: string;
  children: React.ReactNode;
}

/**
 * Screen — every top-level navigation route should be wrapped in this.
 * Handles safe-area insets, sets the canvas background, and centralises the
 * "this is a screen" contract so we never get unstyled white screens.
 */
export function Screen({
  edges = ['top', 'bottom'],
  background,
  style,
  children,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <View
      {...rest}
      style={[
        {
          flex: 1,
          backgroundColor: background ?? theme.bg.canvas,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
