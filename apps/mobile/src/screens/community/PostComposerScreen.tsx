/**
 * PostComposerScreen — modal for creating a Community post.
 *
 * Pick a post type (text / photo / video / certificate), write some
 * text, optionally attach an image, and post. Photo, video poster and
 * certificate images all use the existing image picker; the new post is
 * pushed onto the local community store.
 */
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
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

const TYPES: Array<{ key: PostType; label: string; glyph: string }> = [
  { key: 'text', label: 'Text', glyph: '✍️' },
  { key: 'photo', label: 'Photo', glyph: '📷' },
  { key: 'video', label: 'Video', glyph: '🎬' },
  { key: 'certificate', label: 'Certificate', glyph: '🎓' },
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
  const [mediaUri, setMediaUri] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  const me = { name: user?.name ?? 'You', photoUrl: user?.photoUrl };
  const myHeadline = user?.skills?.[0]
    ? user.skills[0].charAt(0).toUpperCase() + user.skills[0].slice(1)
    : undefined;

  const canPost =
    text.trim().length > 0 ||
    Boolean(mediaUri) ||
    (type === 'certificate' && certTitle.trim().length > 0);

  async function attachMedia() {
    setPicking(true);
    try {
      const picked = await pickProfilePhoto();
      if (picked) setMediaUri(picked.dataUrl);
    } finally {
      setPicking(false);
    }
  }

  function submit() {
    if (!canPost) return;
    addPost({
      author: me,
      headline: myHeadline,
      type,
      text: text.trim(),
      mediaUri,
      certificateTitle:
        type === 'certificate' ? certTitle.trim() || undefined : undefined,
    });
    haptic('success');
    navigation.goBack();
  }

  const attachLabel =
    type === 'video'
      ? 'Add a video thumbnail'
      : type === 'certificate'
        ? 'Add a certificate image'
        : 'Add a photo';

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={{ fontSize: 15, color: theme.text.secondary }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}>
          Create post
        </Text>
        <Pressable
          onPress={submit}
          disabled={!canPost}
          hitSlop={10}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: radii.pill,
            backgroundColor: canPost ? theme.brand.hero : theme.border.default,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            Post
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          paddingBottom: spacing['5xl'],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Author */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Avatar name={me.name} photoUrl={me.photoUrl} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}>
              {me.name}
            </Text>
            {myHeadline ? (
              <Text style={{ fontSize: 12, color: theme.text.secondary }}>
                {myHeadline}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Type selector */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {TYPES.map((tp) => {
            const on = tp.key === type;
            return (
              <Pressable
                key={tp.key}
                onPress={() => {
                  haptic('selection');
                  setType(tp.key);
                  if (tp.key === 'text') setMediaUri(undefined);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: on ? theme.brand.hero : theme.border.default,
                  backgroundColor: on ? theme.brand.heroSubtle : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13 }}>{tp.glyph}</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: on ? '700' : '500',
                    color: on ? theme.brand.hero : theme.text.secondary,
                  }}
                >
                  {tp.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Text body */}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="What do you want to share with the community?"
          placeholderTextColor={theme.text.tertiary}
          style={{
            minHeight: 110,
            fontSize: 15,
            lineHeight: 22,
            color: theme.text.primary,
            textAlignVertical: 'top',
          }}
        />

        {/* Certificate title */}
        {type === 'certificate' ? (
          <View style={{ gap: 6 }}>
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
              onChangeText={setCertTitle}
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

        {/* Media attachment */}
        {type !== 'text' ? (
          mediaUri ? (
            <View style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
              <Image
                source={{ uri: mediaUri }}
                style={{ width: '100%', aspectRatio: 1 }}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setMediaUri(undefined)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={attachMedia}
              disabled={picking}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.lg,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.brand.heroBorder,
                backgroundColor: theme.brand.heroSubtle,
                opacity: pressed || picking ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 18 }}>
                {type === 'video' ? '🎬' : type === 'certificate' ? '🎓' : '📷'}
              </Text>
              <Text
                style={{ fontSize: 14, fontWeight: '600', color: theme.brand.hero }}
              >
                {picking ? 'Opening…' : attachLabel}
              </Text>
            </Pressable>
          )
        ) : null}

        {type === 'video' ? (
          <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
            Prototype note: video posts use a still thumbnail. Full video
            recording will be wired up with the backend.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

export function PostComposerScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
