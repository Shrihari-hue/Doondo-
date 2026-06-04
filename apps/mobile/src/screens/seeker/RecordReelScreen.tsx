/**
 * RecordReelScreen — a worker records their Hire Reels intro.
 *
 * A reel is a short ("hi, I'm Ravi, I've driven trucks for 8 years")
 * video pitch. For a blue-collar worker who can't write a polished
 * profile, talking to camera is the most natural way to be seen — and
 * employers get a real sense of the person, not just a row of text.
 *
 * Three states:
 *   empty   — no reel yet: guidance + Record / Choose buttons
 *   preview — a clip was just captured, awaiting upload (caption + send)
 *   saved   — the worker's reel is live: play it, re-record, or remove
 *
 * The camera, gallery and video player are native modules — verified
 * here by types; the real capture/playback happens on a device build.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { recordReel, pickReel, type ReelCaptureResult } from '@/lib/reelVideo';
import { reelsApi } from '@/api/reels.api';
import { resolveMediaUrl } from '@/api/client';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const TIP_KEYS = ['reels.tip_1', 'reels.tip_2', 'reels.tip_3'] as const;

function RecordReelScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const queryClient = useQueryClient();

  const mineQuery = useQuery({
    queryKey: ['reels', 'mine'],
    queryFn: () => reelsApi.mine(),
    staleTime: 30_000,
  });
  const reel = mineQuery.data?.reel ?? null;

  // A clip captured this session, not yet uploaded.
  const [captured, setCaptured] = useState<ReelCaptureResult | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The source currently on screen: the fresh capture wins, else the
  // saved reel. `useVideoPlayer` must be called unconditionally.
  // Fresh local capture (file://) plays as-is; the saved reel URL is
  // host-relative and resolved against the API base.
  const source = useMemo<string | null>(
    () => captured?.uri ?? resolveMediaUrl(reel?.videoUrl) ?? null,
    [captured, reel],
  );
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });

  // Track player load state. A failed source (dead mock URL, network
  // dropped, etc.) should show a placeholder instead of a black box.
  const { status: playerStatus } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const videoLoading = playerStatus === 'loading' || playerStatus === 'idle';
  const videoErrored = playerStatus === 'error';

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!captured) throw new Error('Nothing to upload');
      return reelsApi.upload({
        videoDataUrl: captured.dataUrl,
        mimeType: captured.mimeType,
        durationSeconds: captured.durationSeconds,
        caption: caption.trim() || null,
      });
    },
    onSuccess: () => {
      haptic('success');
      setCaptured(null);
      void queryClient.invalidateQueries({ queryKey: ['reels'] });
    },
    onError: (err) => {
      haptic('error');
      setError(friendlyErrorMessage(err, t('reels.error_generic')));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => reelsApi.remove(),
    onSuccess: () => {
      haptic('success');
      setCaption('');
      void queryClient.invalidateQueries({ queryKey: ['reels'] });
    },
    onError: (err) => {
      haptic('error');
      setError(friendlyErrorMessage(err, t('reels.error_generic')));
    },
  });

  const busy = uploadMutation.isPending || removeMutation.isPending;

  async function capture(kind: 'camera' | 'library') {
    setError(null);
    try {
      haptic('selection');
      const result =
        kind === 'camera' ? await recordReel() : await pickReel();
      if (result) {
        setCaptured(result);
        setCaption(reel?.caption ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reels.capture_failed'));
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function VideoBox() {
    if (!source) return null;
    // Prefer the saved reel's poster; a freshly-captured clip has no
    // thumbnail yet (the provider produces those on upload).
    const poster = !captured && reel?.thumbnailUrl ? resolveMediaUrl(reel.thumbnailUrl) : null;
    return (
      <View
        style={{
          width: '100%',
          height: 320,
          borderRadius: radii.lg,
          backgroundColor: '#000000',
          overflow: 'hidden',
        }}
      >
        {poster ? (
          <Image
            source={{ uri: poster }}
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

        {videoErrored ? null : (
          <VideoView
            player={player}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            nativeControls
          />
        )}

        {videoLoading && !videoErrored ? (
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

        {videoErrored ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <Text style={{ fontSize: 32 }}>🎬</Text>
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
      </View>
    );
  }

  const mode: 'loading' | 'preview' | 'saved' | 'empty' = mineQuery.isLoading
    ? 'loading'
    : captured
      ? 'preview'
      : reel
        ? 'saved'
        : 'empty';

  return (
    <Screen>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('reels.back')}
          </Text>
        </Pressable>
        <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>
          {t('reels.record_title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
      >
        {mode === 'loading' ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={theme.brand.hero} />
          </View>
        ) : null}

        {/* Intro / guidance */}
        {mode === 'empty' || mode === 'preview' ? (
          <View
            style={{
              backgroundColor: theme.brand.heroSubtle,
              borderRadius: radii.lg,
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <Text
              variant="bodyLarge"
              weight="semibold"
              style={{ color: theme.brand.hero }}
            >
              {t('reels.intro_title')}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ lineHeight: 20 }}>
              {t('reels.intro_body')}
            </Text>
            {TIP_KEYS.map((key) => (
              <Text key={key} variant="footnote" tone="secondary">
                •  {t(key)}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Video */}
        {source ? <VideoBox /> : null}

        {/* Preview mode — caption + upload */}
        {mode === 'preview' ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="footnote" weight="medium" tone="secondary">
                {t('reels.caption_label')}
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.border.default,
                  borderRadius: radii.md,
                  backgroundColor: theme.bg.surface,
                  paddingHorizontal: spacing.md,
                }}
              >
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder={t('reels.caption_placeholder')}
                  placeholderTextColor={theme.text.tertiary}
                  maxLength={140}
                  style={{ fontSize: 15, color: theme.text.primary, minHeight: 42 }}
                />
              </View>
            </View>
            <Button
              label={uploadMutation.isPending ? t('reels.uploading') : t('reels.upload')}
              onPress={() => uploadMutation.mutate()}
              disabled={busy}
            />
            <Pressable
              onPress={() => {
                setCaptured(null);
                setError(null);
              }}
              disabled={busy}
              style={{ alignItems: 'center', paddingVertical: spacing.xs }}
            >
              <Text variant="footnote" tone="secondary">
                {t('reels.retake')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Saved mode — the worker's live reel */}
        {mode === 'saved' && reel ? (
          <View style={{ gap: spacing.md }}>
            {reel.caption ? (
              <Text variant="body" style={{ lineHeight: 21 }}>
                “{reel.caption}”
              </Text>
            ) : null}
            <Text variant="caption" tone="tertiary">
              {t('reels.saved_note')}
            </Text>
            <Button
              label={t('reels.record_again')}
              onPress={() => void capture('camera')}
              disabled={busy}
            />
            <Pressable
              onPress={() => removeMutation.mutate()}
              disabled={busy}
              style={{ alignItems: 'center', paddingVertical: spacing.xs }}
            >
              <Text variant="footnote" tone="danger">
                {removeMutation.isPending ? t('reels.removing') : t('reels.remove')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Empty mode — capture buttons */}
        {mode === 'empty' ? (
          <View style={{ gap: spacing.sm }}>
            <Button
              label={t('reels.record_camera')}
              onPress={() => void capture('camera')}
            />
            <Pressable
              onPress={() => void capture('library')}
              style={{
                borderWidth: 1,
                borderColor: theme.border.default,
                borderRadius: radii.md,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text variant="body" weight="medium" tone="secondary">
                {t('reels.choose_gallery')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Text variant="footnote" tone="danger" style={{ textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

export function RecordReelScreen() {
  return (
    <SeekerThemeOverride>
      <RecordReelScreenInner />
    </SeekerThemeOverride>
  );
}
