/**
 * ReelFeedScreen — the employer's Hire Reels discovery feed.
 *
 * A full-screen, vertically-paged feed of worker intro reels. Instead of
 * scanning rows of text, an employer swipes through real people saying
 * who they are and what they do — a faster, warmer way to get a feel
 * for the talent around them.
 *
 * v1 is browse-only: the feed is for discovery. Reaching out still
 * happens through the normal application flow; surfacing a worker's
 * reel on their applicant card is the natural next step.
 *
 * The video player is a native module — verified here by types; the
 * real playback happens on a device build (and against a real storage
 * provider; the mock provider's URLs are placeholders).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { reelsApi, type PublicReel } from '@/api/reels.api';
import { resolveMediaUrl } from '@/api/client';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, options?: Record<string, unknown>) => string;

/** One full-screen reel. Its own player; plays only while it's the active card. */
function ReelCard({
  reel,
  isActive,
  height,
  t,
}: {
  reel: PublicReel;
  isActive: boolean;
  height: number;
  t: TFn;
}) {
  const player = useVideoPlayer(resolveMediaUrl(reel.videoUrl), (p) => {
    p.loop = true;
    p.muted = false;
  });

  // Track the player's load status so we can distinguish "still buffering"
  // from "URL is dead" — both look identical without this signal.
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const isLoading = status === 'loading' || status === 'idle';
  const hasError = status === 'error';

  useEffect(() => {
    try {
      if (isActive) player.play();
      else player.pause();
    } catch {
      /* native player may not be ready — best-effort */
    }
  }, [isActive, player]);

  const seeker = reel.seeker;
  const initial = (seeker?.name ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={{ height, width: '100%', backgroundColor: '#000000' }}>
      {/* Poster underlay — visible until the first video frame paints,
          and stays visible if the source fails to load. */}
      {reel.thumbnailUrl ? (
        <Image
          source={{ uri: resolveMediaUrl(reel.thumbnailUrl) ?? undefined }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          resizeMode="cover"
        />
      ) : null}

      {hasError ? null : (
        <VideoView
          player={player}
          style={{ flex: 1 }}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Loading spinner — only while the player is actually fetching,
          not after it has settled into a usable state. */}
      {isLoading && !hasError ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}

      {/* Friendly placeholder when the URL is dead (mock provider,
          deleted upstream, network failure). Otherwise the user just
          sees a black rectangle and assumes the app is broken. */}
      {hasError ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
            gap: spacing.xs,
          }}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 40 }}>🎬</Text>
          <Text
            variant="bodyLarge"
            weight="medium"
            style={{ color: '#FFFFFF', textAlign: 'center' }}
          >
            {t('reels.video_unavailable_title')}
          </Text>
          <Text
            variant="footnote"
            style={{
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
            }}
          >
            {t('reels.video_unavailable_body')}
          </Text>
        </View>
      ) : null}

      {/* Worker overlay */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: spacing.xl,
          paddingBottom: spacing['3xl'],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {seeker?.photoUrl ? (
            <Image
              source={{ uri: seeker.photoUrl }}
              style={{ width: 44, height: 44, borderRadius: 22 }}
            />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>
                {initial}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              variant="bodyLarge"
              weight="semibold"
              style={{ color: '#FFFFFF' }}
              numberOfLines={1}
            >
              {seeker?.name || t('reels.feed_worker_fallback')}
            </Text>
            {seeker?.skills && seeker.skills.length > 0 ? (
              <Text
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}
                numberOfLines={1}
              >
                {seeker.skills.slice(0, 3).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
        {reel.caption ? (
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 14,
              lineHeight: 20,
              marginTop: spacing.sm,
            }}
            numberOfLines={3}
          >
            {reel.caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ReelFeedScreen() {
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const { height } = useWindowDimensions();

  const feedQuery = useQuery({
    queryKey: ['reels', 'feed'],
    queryFn: () => reelsApi.feed(20),
    staleTime: 60_000,
  });
  const reels = feedQuery.data?.reels ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.item) setActiveId((first.item as PublicReel).id);
    },
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 });

  const renderItem = useCallback(
    ({ item }: { item: PublicReel }) => (
      <ReelCard reel={item} isActive={item.id === activeId} height={height} t={t} />
    ),
    [activeId, height, t],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {feedQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : reels.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
            gap: spacing.sm,
          }}
        >
          <Text style={{ fontSize: 40 }}>🎬</Text>
          <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFFFF' }}>
            {t('reels.feed_empty_title')}
          </Text>
          <Text
            variant="footnote"
            style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}
          >
            {t('reels.feed_empty_body')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={height}
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
        />
      )}

      {/* Floating header */}
      <View
        style={{
          position: 'absolute',
          top: spacing['2xl'],
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
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: radii.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
          }}
        >
          <Text variant="footnote" weight="medium" style={{ color: '#FFFFFF' }}>
            {t('reels.back')}
          </Text>
        </Pressable>
        <Text
          variant="body"
          weight="semibold"
          style={{
            color: '#FFFFFF',
            flex: 1,
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowRadius: 4,
          }}
        >
          {t('reels.feed_title')}
        </Text>
      </View>
    </View>
  );
}
