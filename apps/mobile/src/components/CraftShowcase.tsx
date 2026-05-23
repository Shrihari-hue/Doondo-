import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { champagne, spacing, radii } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import type { CraftPhoto } from '@/api/types';
import { buildCollections, type CraftCollection } from '@/lib/craftShowcase';
import { Text } from './Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - spacing.xl * 2, 280);
const CARD_GAP = spacing.md;
const SNAP = CARD_WIDTH + CARD_GAP;

interface Props {
  title: string;
  subtitle: string;
  /** The worker's full, flat photo list — each tagged to a craft skill. */
  photos: CraftPhoto[];
  /**
   * The worker's skills. Used to split `photos` into per-craft collections.
   * When omitted (or no gallery skill matches), all photos render as one
   * "Portfolio" collection so nothing is ever hidden.
   */
  skills?: string[];
  /** Verification counts, keyed by the photo's index in the flat `photos`. */
  verificationCounts?: Map<number, number>;
  /** Called with the photo's flat index in `photos`. */
  onVerifyPhoto?: (flatIndex: number) => void;
  verifyPending?: boolean;
  verifyLabel?: string;
  /** Premium subscribers get the champagne-gold collection border. */
  premium?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCtaLabel?: string;
  onEmptyPress?: () => void;
}

const GOLD_STRONG = 'rgba(184, 153, 104, 0.85)';
const GOLD_SOFT = 'rgba(184, 153, 104, 0.55)';

export function CraftShowcase({
  title,
  subtitle,
  photos,
  skills,
  verificationCounts,
  onVerifyPhoto,
  verifyPending = false,
  verifyLabel = 'Verify',
  premium = false,
  emptyTitle,
  emptyBody,
  emptyCtaLabel,
  onEmptyPress,
}: Props) {
  const { theme } = useTheme();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIdx, setActiveIdx] = useState(0);

  // Group the flat photo list into per-craft collections. If no gallery
  // skill matches, fall back to a single "Portfolio" collection so a
  // worker's photos are never silently dropped.
  const collections = useMemo<CraftCollection[]>(() => {
    const built = buildCollections(skills ?? [], photos);
    if (built.length > 0) return built;
    if (photos.length === 0) return [];
    return [{ skill: '', label: 'Portfolio', photos, cover: photos[0] ?? null }];
  }, [skills, photos]);

  if (photos.length === 0 || collections.length === 0) {
    if (!emptyTitle || !emptyBody) return null;
    return (
      <View
        style={{
          borderRadius: radii.xl,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          backgroundColor: theme.bg.surface,
          padding: spacing.lg,
          gap: spacing.sm,
        }}
      >
        <View style={{ gap: 4 }}>
          <Text variant="bodyLarge" weight="medium">
            {emptyTitle}
          </Text>
          <Text variant="body" tone="secondary">
            {emptyBody}
          </Text>
        </View>
        {emptyCtaLabel && onEmptyPress ? (
          <Pressable
            onPress={onEmptyPress}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
              backgroundColor: theme.brand.hero,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
              {emptyCtaLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const clampedIdx = Math.min(activeIdx, collections.length - 1);
  const active = collections[clampedIdx]!;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 4, paddingHorizontal: 2 }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {title.toUpperCase()}
        </Text>
        <Text variant="body" tone="secondary">
          {subtitle}
        </Text>
      </View>

      {/* Collection switcher — one chip per craft. Hidden for single-craft
          workers, where there's nothing to switch between. */}
      {collections.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: 2, paddingVertical: 2 }}
        >
          {collections.map((collection, index) => {
            const selected = index === clampedIdx;
            return (
              <Pressable
                key={collection.skill || `collection-${index}`}
                onPress={() => {
                  setActiveIdx(index);
                  scrollX.setValue(0);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                  borderRadius: radii.pill,
                  backgroundColor: selected ? theme.brand.hero : theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: selected ? theme.brand.hero : theme.border.subtle,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: selected ? '#FFFFFF' : theme.text.secondary,
                  }}
                >
                  {collection.label}
                  {`  ${collection.photos.length}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Animated.ScrollView
        // Remount per collection so the scroll offset resets cleanly.
        key={active.skill || 'portfolio'}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SNAP}
        snapToAlignment="start"
        bounces={false}
        contentContainerStyle={{ gap: CARD_GAP, paddingRight: spacing.xl }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {active.photos.map((photo, index) => {
          const inputRange = [
            (index - 1) * SNAP,
            index * SNAP,
            (index + 1) * SNAP,
          ];
          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [14, 0, 14],
            extrapolate: 'clamp',
          });
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.94, 1, 0.94],
            extrapolate: 'clamp',
          });
          const rotate = scrollX.interpolate({
            inputRange,
            outputRange: ['-3deg', '0deg', '3deg'],
            extrapolate: 'clamp',
          });
          // Verification is keyed by the photo's index in the flat list.
          const flatIndex = photos.indexOf(photo);
          const verifyCount =
            flatIndex >= 0 ? verificationCounts?.get(flatIndex) ?? 0 : 0;
          const goldBorder = premium || verifyCount > 0;

          return (
            <Animated.View
              key={`${photo.url.slice(-20)}-${index}`}
              style={{
                width: CARD_WIDTH,
                transform: [{ translateY }, { scale }, { rotate }],
              }}
            >
              <View
                style={{
                  borderRadius: radii.xl,
                  overflow: 'hidden',
                  backgroundColor: theme.bg.surface,
                  borderWidth: premium ? 1 : verifyCount > 0 ? 0.75 : 0.5,
                  borderColor: premium
                    ? GOLD_STRONG
                    : verifyCount > 0
                      ? GOLD_SOFT
                      : theme.border.subtle,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.18,
                  shadowRadius: 22,
                  elevation: 6,
                }}
              >
                <Image source={{ uri: photo.url }} style={{ width: '100%', height: 240 }} />

                <LinearGradient
                  colors={['rgba(9,8,11,0.02)', 'rgba(9,8,11,0.78)', 'rgba(9,8,11,0.96)']}
                  locations={[0, 0.62, 1]}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'space-between',
                    padding: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {verifyCount > 0 ? (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: radii.pill,
                          backgroundColor: 'rgba(184, 153, 104, 0.92)',
                          borderWidth: 0.5,
                          borderColor: 'rgba(255, 253, 247, 0.28)',
                        }}
                      >
                        <Text style={{ color: '#FFFDF7', fontSize: 11, fontWeight: '700' }}>
                          {verifyCount === 1 ? 'Verified sample' : `${verifyCount} verifications`}
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}

                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: 'rgba(255, 253, 247, 0.14)',
                        borderWidth: 0.5,
                        borderColor: 'rgba(255, 253, 247, 0.20)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: champagne[200], fontSize: 18 }}>✦</Text>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: radii.pill,
                          backgroundColor: 'rgba(255, 253, 247, 0.12)',
                          borderWidth: 0.5,
                          borderColor: 'rgba(255, 253, 247, 0.18)',
                        }}
                      >
                        <Text style={{ color: '#FFFDF7', fontSize: 11, fontWeight: '600' }}>
                          {active.label}
                        </Text>
                      </View>
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ color: '#FFFDF7', fontSize: 18, fontWeight: '700' }}>
                        {photo.caption?.trim()
                          ? photo.caption.trim()
                          : `${active.label} · ${index + 1}`}
                      </Text>
                      <Text style={{ color: 'rgba(255,253,247,0.82)', fontSize: 13, lineHeight: 18 }}>
                        Proof of work that employers can scan in seconds.
                      </Text>
                    </View>

                    {onVerifyPhoto && flatIndex >= 0 ? (
                      <Pressable
                        onPress={() => onVerifyPhoto(flatIndex)}
                        disabled={verifyPending}
                        style={({ pressed }) => ({
                          alignSelf: 'flex-start',
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          borderRadius: radii.pill,
                          backgroundColor: 'rgba(37, 99, 235, 0.94)',
                          opacity: verifyPending ? 0.55 : pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                          {verifyLabel}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </LinearGradient>
              </View>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: 2 }}
      >
        <MetaPill
          label={`${active.photos.length} ${active.photos.length === 1 ? 'photo' : 'photos'}`}
        />
        <MetaPill label="Swipe to browse" />
        {collections.length > 1 ? (
          <MetaPill label={`${collections.length} crafts`} />
        ) : null}
        {verificationCounts && verificationCounts.size > 0 ? (
          <MetaPill label="Employer-verified proof" />
        ) : null}
      </ScrollView>
    </View>
  );
}

function MetaPill({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.pill,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
      }}
    >
      <Text style={{ fontSize: 11, color: theme.text.secondary, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
