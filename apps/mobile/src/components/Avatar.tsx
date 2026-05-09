/**
 * Avatar — circular profile image. Shows the user's initials in a gem
 * gradient when no photo is set, and the photo when there is one.
 *
 * Pure presentation — accepts `name` for the initials and `photoUrl`
 * (data URL or external URL). Caller decides where to render it (Profile
 * header, tab bar, applicant card).
 */

import { Image, View } from 'react-native';
import { coral, champagne } from '@doondo/tokens';
import { Text } from './Text';

interface Props {
  name: string;
  photoUrl?: string | null;
  /** Diameter in pt. Default 88. */
  size?: number;
  /** Premium hairline ring (verified, top match). Default false. */
  premium?: boolean;
}

export function Avatar({ name, photoUrl, size = 88, premium = false }: Props) {
  const initials = getInitials(name);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: premium ? 1.2 : 0.5,
        borderColor: premium ? champagne[300] : 'rgba(236, 232, 223, 0.18)',
        overflow: 'hidden',
        backgroundColor: coral[600],
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
            color: champagne[200],
            fontSize: size * 0.36,
            fontWeight: '500',
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
