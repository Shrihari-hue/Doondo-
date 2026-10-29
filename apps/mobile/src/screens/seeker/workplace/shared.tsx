/**
 * Shared pieces for the Look Inside / workplace screens — these screens
 * are always dark glass over photography, independent of the app theme.
 */

import { useEffect, useState } from 'react';
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components';
import { resolveMediaUrl } from '@/api/client';
import type { McIcon } from '@/lib/jobCategory';

export const GLASS = {
  backgroundColor: 'rgba(40,36,32,0.55)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.35)',
} as const;

export const INK = '#120F0C';
export const WHITE_DIM = 'rgba(255,255,255,0.72)';

/** Natural pixel size of a remote image (null until known). */
export function useImageSize(uri: string | null | undefined): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setSize(null);
    const resolved = resolveMediaUrl(uri);
    if (!resolved) return;
    let alive = true;
    Image.getSize(
      resolved,
      (w, h) => alive && setSize({ w, h }),
      () => alive && setSize({ w: 3, h: 4 }),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return size;
}

/**
 * Map a 0..1 point on an image to screen coordinates when the image is
 * drawn with resizeMode="cover" into a box. Returns null if the point
 * is cropped out.
 */
export function coverPoint(
  pt: { x: number; y: number },
  img: { w: number; h: number },
  box: { w: number; h: number },
): { x: number; y: number } | null {
  const scale = Math.max(box.w / img.w, box.h / img.h);
  const dw = img.w * scale;
  const dh = img.h * scale;
  const x = pt.x * dw - (dw - box.w) / 2;
  const y = pt.y * dh - (dh - box.h) / 2;
  if (x < 0 || y < 0 || x > box.w || y > box.h) return null;
  return { x, y };
}

export function CircleButton({
  icon,
  onPress,
  label,
  active,
  style,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  label: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(20,18,16,0.38)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.75)',
        },
        style,
      ]}
    >
      <Feather name={icon} size={20} color={active ? '#FFD38A' : '#FFFFFF'} />
    </Pressable>
  );
}

/** Rounded photo (resolved media URL) or an icon tile fallback. */
export function Thumb({
  uri,
  icon,
  size,
  radius,
  ring,
}: {
  uri: string | null | undefined;
  icon: McIcon;
  size: number;
  radius: number;
  ring?: boolean;
}) {
  const resolved = resolveMediaUrl(uri);
  const border = ring ? { borderWidth: 2, borderColor: 'rgba(255,214,150,0.9)' } : null;
  if (resolved) {
    return <Image source={{ uri: resolved }} style={[{ width: size, height: size, borderRadius: radius, backgroundColor: '#3A322A' }, border]} />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: '#FFEBCB', alignItems: 'center', justifyContent: 'center' }, border]}>
      <MaterialCommunityIcons name={icon} size={size * 0.55} color="#B26B12" />
    </View>
  );
}

export function Brand({ sub }: { sub: string }) {
  return (
    <View>
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '600', letterSpacing: 8 }} numberOfLines={1}>
        DOONDO
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10.5, letterSpacing: 2.6, marginTop: 3 }} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}
