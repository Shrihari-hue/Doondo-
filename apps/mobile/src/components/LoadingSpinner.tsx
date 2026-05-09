import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

interface Props {
  /** Fills the parent and centers itself. Use for full-screen loading. */
  fullScreen?: boolean;
  /** 'small' | 'large' from RN. Default 'small'. */
  size?: 'small' | 'large';
  /** Override the color (default: brand hero coral). */
  color?: string;
}

export function LoadingSpinner({ fullScreen = false, size = 'small', color }: Props) {
  const { theme } = useTheme();
  const tint = color ?? theme.brand.hero;
  if (fullScreen) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg.canvas,
        }}
      >
        <ActivityIndicator size={size} color={tint} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={tint} />;
}
