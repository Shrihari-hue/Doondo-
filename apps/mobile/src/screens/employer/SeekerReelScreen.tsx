/**
 * SeekerReelScreen — full-screen playback of ONE worker's Hire Reels
 * intro video. Hire Reels follow-up (#24): the natural next step after
 * the browse-only discovery feed — surfacing a specific worker's reel
 * from their applicant card, with a "Contact" action right there so an
 * employer who likes what they see doesn't have to hunt for it.
 *
 * The player itself mirrors ReelFeedScreen.tsx's ReelCard exactly
 * (same expo-video setup, same poster/loading/error states) — kept as
 * a separate small component rather than importing that screen's
 * internal one, since this is a single fixed video, not a paged list.
 */
import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { reelsApi } from '@/api/reels.api';
import { resolveMediaUrl } from '@/api/client';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'SeekerReel'>;
type Route = RouteProp<AppStackParamList, 'SeekerReel'>;

function Player({ videoUrl, thumbnailUrl }: { videoUrl: string; thumbnailUrl: string | null }) {
  const player = useVideoPlayer(resolveMediaUrl(videoUrl), (p) => {
    p.loop = true;
    p.muted = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const isLoading = status === 'loading' || status === 'idle';
  const hasError = status === 'error';

  useEffect(() => {
    try {
      player.play();
    } catch {
      /* native player may not be ready — best-effort */
    }
    return () => {
      try {
        player.pause();
      } catch {
        /* best-effort */
      }
    };
  }, [player]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {thumbnailUrl ? (
        <Image
          source={{ uri: resolveMediaUrl(thumbnailUrl) ?? undefined }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />
      ) : null}
      {hasError ? null : <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />}
      {isLoading && !hasError ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

export function SeekerReelScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { seekerId, seekerName } = route.params;

  const query = useQuery({
    queryKey: ['reels', 'seeker', seekerId],
    queryFn: () => reelsApi.forSeeker(seekerId),
  });
  const reel = query.data?.reel;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : !reel ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm }}>
          <Feather name="film" size={36} color="rgba(255,255,255,0.7)" />
          <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFFFF' }}>
            {t('reels.feed_empty_title')}
          </Text>
        </View>
      ) : (
        <Player videoUrl={reel.videoUrl} thumbnailUrl={reel.thumbnailUrl} />
      )}

      {/* Header */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={() => {
            haptic('light');
            navigation.goBack();
          }}
          hitSlop={12}
          style={{ borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <Feather name="chevron-left" size={18} color="#FFFFFF" />
        </Pressable>
        <Text
          variant="body"
          weight="semibold"
          numberOfLines={1}
          style={{ color: '#FFFFFF', flex: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}
        >
          {seekerName}
        </Text>
      </View>

      {/* Contact from reel — the Hire Reels follow-up action. Routes
          through the existing employer→worker Hiring Request flow
          rather than opening a raw chat: v1 Hire Reels is deliberately
          browse-only, and a hiring request is the invite surface this
          codebase already has for "employer reaches out first". */}
      {reel && (
        <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: insets.bottom + spacing.xl }}>
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('SendHiringRequest', { seekerId, seekerName });
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              backgroundColor: '#FFFFFF',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="send" size={16} color="#111111" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111111' }}>
              {t('reels.contact_cta')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
