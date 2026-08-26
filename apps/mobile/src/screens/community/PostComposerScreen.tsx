/**
 * PostComposerScreen — "Create Update", the Community post composer.
 *
 * A single rich screen: author card, a six-way content-type picker
 * (Thought / Photo / Video / Certificate / Resume / Voice), a large
 * text field, a type-specific media area, AI post-suggestion chips, and
 * a live preview of how the post will appear in the feed.
 *
 * Photo posts can carry several images; video / certificate / resume
 * carry one image (a poster / scan). Voice capture needs the native
 * audio module — until that ships, the Voice pane explains as much.
 */
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Feather } from '@expo/vector-icons';
import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { pickProfilePhoto } from '@/lib/photo';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useCommunityStore, type PostType } from '@/stores/community.store';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'CommunityComposer'>;

interface TypeCfg {
  key: PostType;
  label: string;
  glyph: string;
  tint: string;
}

const TYPES: TypeCfg[] = [
  { key: 'text', label: 'Thought', glyph: '✏️', tint: '#FEF3C7' },
  { key: 'photo', label: 'Photo', glyph: '📷', tint: '#DBEAFE' },
  { key: 'video', label: 'Video', glyph: '🎥', tint: '#BFDBFE' },
  { key: 'certificate', label: 'Certificate', glyph: '🏆', tint: '#FDE7B8' },
  { key: 'resume', label: 'Resume', glyph: '📄', tint: '#DCFCE7' },
  { key: 'voice', label: 'Voice', glyph: '🎤', tint: '#FFEDD5' },
];

interface Suggestion {
  label: string;
  text: string;
}

const SUGGESTION_SETS: Suggestion[][] = [
  [
    {
      label: 'Completed training? 🎓',
      text: 'Learning never stops! Completed my electrical safety training today.',
    },
    {
      label: 'Got a certificate? 🏆',
      text: 'Proud to share that I earned a new certificate this week.',
    },
    {
      label: 'Found a new job? 💼',
      text: "Excited to share I've started a new role. Grateful for the opportunity!",
    },
  ],
  [
    {
      label: 'Finished a big job? ✅',
      text: 'Wrapped up a great project today — happy with how it turned out.',
    },
    {
      label: 'Hit a milestone? 🌟',
      text: 'Reached a small milestone in my work today. Onward!',
    },
    {
      label: 'Learned a skill? 🛠️',
      text: 'Picked up a new skill this week and already putting it to use.',
    },
  ],
];

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const addPost = useCommunityStore((s) => s.addPost);

  const [type, setType] = useState<PostType>(route.params?.type ?? 'text');
  const [text, setText] = useState('');
  const [certTitle, setCertTitle] = useState('');
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [suggestionSet, setSuggestionSet] = useState(0);

  const meName = user?.name ?? 'You';
  const role = user?.skills?.[0]
    ? user.skills[0].charAt(0).toUpperCase() + user.skills[0].slice(1)
    : 'Worker';
  const location =
    user?.location?.city ?? user?.location?.area ?? 'Your area';

  const canPost =
    text.trim().length > 0 ||
    mediaUris.length > 0 ||
    (type === 'certificate' && certTitle.trim().length > 0);

  async function attachMedia() {
    setPicking(true);
    try {
      const picked = await pickProfilePhoto();
      if (picked) {
        setMediaUris((cur) =>
          type === 'photo' ? [...cur, picked.dataUrl].slice(0, 6) : [picked.dataUrl],
        );
      }
    } finally {
      setPicking(false);
    }
  }

  function removeMedia(index: number) {
    setMediaUris((cur) => cur.filter((_, i) => i !== index));
  }

  function pickType(next: PostType) {
    haptic('selection');
    setType(next);
    // Media doesn't carry across types — a photo gallery isn't a resume scan.
    if (next === 'text' || next === 'voice') setMediaUris([]);
    else setMediaUris((cur) => cur.slice(0, next === 'photo' ? 6 : 1));
  }

  function submit() {
    if (!canPost) return;
    addPost({
      author: { name: meName, photoUrl: user?.photoUrl },
      headline: role,
      type,
      text: text.trim(),
      mediaUris,
      certificateTitle:
        type === 'certificate' ? certTitle.trim() || undefined : undefined,
    });
    haptic('success');
    navigation.goBack();
  }

  const suggestions = SUGGESTION_SETS[suggestionSet] ?? SUGGESTION_SETS[0]!;

  return (
    <Screen edges={[]}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20, color: theme.text.primary }}>←</Text>
            </Pressable>
          </View>

          <Text
            style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary, textAlign: 'center' }}
            numberOfLines={1}
          >
            Create Update
          </Text>

          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {canPost ? (
              <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel="Post">
                <LinearGradient
                  colors={[blue[500], blue[400]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 18,
                    paddingVertical: 9,
                    borderRadius: radii.pill,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                    Post
                  </Text>
                  <Feather name="send" size={14} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: radii.pill,
                  backgroundColor: theme.border.default,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                  Post
                </Text>
                <Feather name="send" size={14} color="#FFFFFF" />
              </View>
            )}
          </View>
        </View>
        <Text
          style={{
            fontSize: 12,
            color: theme.text.tertiary,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          Add content
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: spacing.xs,
          gap: spacing.md,
          paddingBottom: spacing['5xl'],
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Author card ─────────────────────────────────────────────── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View>
              <Avatar name={meName} photoUrl={user?.photoUrl} size={56} />
              <View
                style={{
                  position: 'absolute',
                  bottom: 1,
                  right: 1,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: '#22C55E',
                  borderWidth: 2,
                  borderColor: theme.bg.surface,
                }}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}
                  numberOfLines={1}
                >
                  {meName}
                </Text>
                <VerifiedBadge />
              </View>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: radii.pill,
                  backgroundColor: blue[50],
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: blue[700] }}>
                  {role}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                  📍 {location}
                </Text>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: '#22C55E',
                  }}
                />
                <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>
                  Active now
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* ── Content-type picker ─────────────────────────────────────── */}
        <Card padded={false}>
          <View
            style={{ flexDirection: 'row', padding: spacing.sm, gap: 4 }}
          >
            {TYPES.map((cfg) => (
              <TypeCard
                key={cfg.key}
                cfg={cfg}
                selected={cfg.key === type}
                onPress={() => pickType(cfg.key)}
              />
            ))}
          </View>
        </Card>

        {/* ── Text field ──────────────────────────────────────────────── */}
        <Card>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Share your work, progress, achievement or ideas..."
            placeholderTextColor={theme.text.tertiary}
            style={{
              fontSize: 18,
              lineHeight: 26,
              color: theme.text.primary,
              minHeight: 92,
              textAlignVertical: 'top',
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
              Inspire nearby workers today ✨
            </Text>
            <Text style={{ fontSize: 16 }}>😊</Text>
          </View>
        </Card>

        {/* ── Type-specific media area ────────────────────────────────── */}
        <MediaArea
          type={type}
          mediaUris={mediaUris}
          picking={picking}
          certTitle={certTitle}
          onCertTitle={setCertTitle}
          onAttach={attachMedia}
          onRemove={removeMedia}
        />

        {/* ── AI post suggestions ─────────────────────────────────────── */}
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>
              ✨ AI Post Suggestions
            </Text>
            <Pressable
              onPress={() => {
                haptic('selection');
                setSuggestionSet((s) => (s + 1) % SUGGESTION_SETS.length);
              }}
              hitSlop={8}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.brand.hero }}>
                See more
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => {
                  haptic('selection');
                  setText(s.text);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  backgroundColor: theme.brand.heroSubtle,
                  borderWidth: 0.5,
                  borderColor: theme.brand.heroBorder,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.brand.hero }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* ── Live preview ────────────────────────────────────────────── */}
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
              👁  Live Preview
            </Text>
            <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
              This is how your post will appear
            </Text>
          </View>
          <View
            style={{
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              borderRadius: radii.lg,
              padding: spacing.md,
              backgroundColor: theme.bg.canvas,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <Avatar name={meName} photoUrl={user?.photoUrl} size={34} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}
                  >
                    {meName}
                  </Text>
                  <VerifiedBadge />
                </View>
                <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                  Just now · {location}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  lineHeight: 19,
                  color: text.trim() ? theme.text.primary : theme.text.tertiary,
                }}
              >
                {text.trim() || 'Your post text will show here…'}
              </Text>
              {mediaUris[0] ? (
                <Image
                  source={{ uri: mediaUris[0] }}
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                  resizeMode="cover"
                />
              ) : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: spacing.md,
              }}
            >
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>👍 0</Text>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>💬 0</Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.text.tertiary }}>🔖</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ─── pieces ──────────────────────────────────────────────────────────────────

function Card({
  children,
  padded = true,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: padded ? spacing.lg : 0,
      }}
    >
      {children}
    </View>
  );
}

function VerifiedBadge() {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>✓</Text>
    </View>
  );
}

function TypeCard({
  cfg,
  selected,
  onPress,
}: {
  cfg: TypeCfg;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={cfg.label}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 5,
        paddingVertical: 8,
        borderRadius: radii.lg,
        borderWidth: 1.5,
        borderColor: selected ? theme.brand.hero : 'transparent',
        backgroundColor: selected ? theme.brand.heroSubtle : 'transparent',
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          backgroundColor: cfg.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 19 }}>{cfg.glyph}</Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10,
          fontWeight: selected ? '700' : '500',
          color: selected ? theme.brand.hero : theme.text.secondary,
        }}
      >
        {cfg.label}
      </Text>
    </Pressable>
  );
}

function MediaArea({
  type,
  mediaUris,
  picking,
  certTitle,
  onCertTitle,
  onAttach,
  onRemove,
}: {
  type: PostType;
  mediaUris: string[];
  picking: boolean;
  certTitle: string;
  onCertTitle: (v: string) => void;
  onAttach: () => void;
  onRemove: (index: number) => void;
}) {
  const { theme } = useTheme();

  if (type === 'text') return null;

  if (type === 'voice') {
    return (
      <Card>
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Voice notes',
                'Voice recording switches on once the audio module ships with the next app build.',
              )
            }
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: '#FFEDD5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 32 }}>🎤</Text>
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>
            Tap to record a voice note
          </Text>
          <Text
            style={{ fontSize: 11, color: theme.text.tertiary, textAlign: 'center' }}
          >
            Voice capture turns on with the next app build.
          </Text>
        </View>
      </Card>
    );
  }

  const single = type !== 'photo';

  return (
    <Card>
      {type === 'certificate' ? (
        <View style={{ gap: 6, marginBottom: spacing.md }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1,
              color: theme.text.tertiary,
            }}
          >
            CERTIFICATE TITLE
          </Text>
          <TextInput
            value={certTitle}
            onChangeText={onCertTitle}
            placeholder="e.g. Electrical Safety — Level 2 Certified"
            placeholderTextColor={theme.text.tertiary}
            style={{
              fontSize: 14,
              color: theme.text.primary,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              borderRadius: 10,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          />
        </View>
      ) : null}

      {single ? (
        mediaUris[0] ? (
          <View style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
            <Image
              source={{ uri: mediaUris[0] }}
              style={{ width: '100%', aspectRatio: 1 }}
              resizeMode="cover"
            />
            <RemoveButton onPress={() => onRemove(0)} />
          </View>
        ) : (
          <UploadZone
            label={
              type === 'video'
                ? 'Tap to add a video thumbnail'
                : type === 'resume'
                  ? 'Tap to add your resume'
                  : 'Tap to add a certificate image'
            }
            picking={picking}
            onPress={onAttach}
          />
        )
      ) : mediaUris.length === 0 ? (
        <UploadZone label="Tap to upload a photo" picking={picking} onPress={onAttach} />
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={onAttach}
            disabled={picking || mediaUris.length >= 6}
            style={{
              flex: 1,
              aspectRatio: 1,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.brand.heroBorder,
              backgroundColor: theme.brand.heroSubtle,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: picking || mediaUris.length >= 6 ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 26 }}>☁️</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: theme.brand.hero,
                marginTop: 4,
              }}
            >
              {mediaUris.length >= 6 ? 'Max 6' : 'Add photo'}
            </Text>
          </Pressable>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              rowGap: spacing.sm,
            }}
          >
            {mediaUris.slice(0, 4).map((u, i) => {
              const overflow = i === 3 && mediaUris.length > 4;
              return (
                <View
                  key={`${i}-${u.slice(-12)}`}
                  style={{
                    width: '48%',
                    aspectRatio: 1,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    source={{ uri: u }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  {overflow ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(9,8,11,0.55)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>
                        +{mediaUris.length - 4}
                      </Text>
                    </View>
                  ) : (
                    <RemoveButton small onPress={() => onRemove(i)} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Card>
  );
}

function UploadZone({
  label,
  picking,
  onPress,
}: {
  label: string;
  picking: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={picking}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing['2xl'],
        borderRadius: radii.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.brand.heroBorder,
        backgroundColor: theme.brand.heroSubtle,
        opacity: picking ? 0.6 : 1,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 34 }}>☁️</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>
        {picking ? 'Opening…' : label}
      </Text>
      <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
        JPG · PNG · Up to 20MB
      </Text>
    </Pressable>
  );
}

function RemoveButton({
  onPress,
  small,
}: {
  onPress: () => void;
  small?: boolean;
}) {
  const size = small ? 24 : 30;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Remove"
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: small ? 13 : 15 }}>✕</Text>
    </Pressable>
  );
}

export function PostComposerScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
