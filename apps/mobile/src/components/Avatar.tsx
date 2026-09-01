/**
 * Avatar — circular profile image. Shows the user's initials in a gem
 * gradient when no photo is set, and the photo when there is one.
 *
 * Pure presentation — accepts `name` for the initials and `photoUrl`
 * (data URL or external URL). Caller decides where to render it (Profile
 * header, tab bar, applicant card).
 */

import { Image, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';

interface Props {
  name: string;
  photoUrl?: string | null;
  /** Diameter in pt. Default 88. */
  size?: number;
  /** Premium hairline ring (verified, top match). Default false. */
  premium?: boolean;
}

/**
 * 8 brand-adjacent hues for avatar backgrounds.
 * Hash of the name deterministically picks one, so the same person
 * always gets the same colour across every screen.
 */
const AVATAR_COLORS = [
  '#2563EB', // blue
  '#16A34A', // green
  '#9333EA', // violet
  '#EA580C', // orange
  '#0891B2', // cyan
  '#BE185D', // pink
  '#CA8A04', // amber-dark
  '#0F766E', // teal
] as const;

function nameToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function Avatar({ name, photoUrl, size = 88, premium = false }: Props) {
  const { theme } = useTheme();
  const initials = getInitials(name);
  const bgColor = nameToColor(name);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: premium ? 1.5 : 0,
        borderColor: premium ? theme.premium.hairline : 'transparent',
        overflow: 'hidden',
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={{
            color: theme.text.onBrand,
            fontSize: size * 0.36,
            fontWeight: '700',
            letterSpacing: 0.5,
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
