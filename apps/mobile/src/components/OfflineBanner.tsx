/**
 * OfflineBanner — a thin amber strip that appears when the device has no
 * internet connectivity. Uses a lightweight polling approach (fetch to a
 * tiny endpoint) so it works without @react-native-community/netinfo.
 *
 * Mount once inside Screen layouts. The banner auto-dismisses as soon as
 * connectivity returns.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Animated, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Text } from '@/components/Text';

const AMBER      = '#F59E0B';
const AMBER_DARK = '#78350F';
const AMBER_BG   = '#FFFBEB';
const CHECK_URL  = 'https://clients3.google.com/generate_204'; // 204 response, tiny
const INTERVAL   = 8_000; // ms

async function isOnline(): Promise<boolean> {
  try {
    const res = await fetch(CHECK_URL, { method: 'HEAD', cache: 'no-store' });
    return res.status < 400;
  } catch {
    return false;
  }
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    const online = await isOnline();
    setOffline(!online);
  };

  useEffect(() => {
    void check();
    timerRef.current = setInterval(() => void check(), INTERVAL);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: offline ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [offline, slideAnim]);

  if (!offline) return null;

  return (
    <Animated.View
      style={{
        backgroundColor: AMBER_BG,
        borderBottomWidth: 1,
        borderBottomColor: AMBER,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 16,
        gap: 6,
        transform: [
          {
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-32, 0],
            }),
          },
        ],
      }}
    >
      <Feather name="wifi-off" size={13} color={AMBER} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: AMBER_DARK }}>
        You're offline — some data may be outdated.
      </Text>
    </Animated.View>
  );
}
