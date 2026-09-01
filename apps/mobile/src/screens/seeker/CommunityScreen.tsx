/**
 * CommunityScreen — the seeker's "Community" tab: a LinkedIn-style feed.
 *
 * Workers post updates, photos, videos and certificates; everyone can
 * like, comment, and repost to their own community profile. The feed
 * data lives in a local prototype store (see stores/community.store.ts)
 * — swap that for a backend later without touching this screen.
 *
 * Layout: a composer prompt pinned at the top of the list, then the
 * feed of PostCards.
 */
import { useEffect } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import {
  useCommunityStore,
  type FeedPost,
  type FeedAuthor,
} from '@/stores/community.store';
import { PostCard } from '@/screens/community/PostCard';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const posts = useCommunityStore((s) => s.posts);
  const repost = useCommunityStore((s) => s.repost);
  const loadFeed = useCommunityStore((s) => s.loadFeed);
  const loading = useCommunityStore((s) => s.loading);

  // Pull the live feed from the backend on mount. If the backend is
  // unreachable the store keeps the seed feed so the tab isn't blank.
  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const me: FeedAuthor = {
    name: user?.name ?? 'You',
    photoUrl: user?.photoUrl,
  };
  const myHeadline = user?.skills?.[0] ? capitalize(user.skills[0]) : undefined;

  function openComposer(type?: 'photo' | 'video' | 'certificate') {
    haptic('selection');
    navigation.navigate('CommunityComposer', type ? { type } : undefined);
  }

  function onRepost(post: FeedPost) {
    Alert.alert(
      'Repost',
      'Share this post to your community profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Repost',
          onPress: () => {
            repost(post.id, me, myHeadline);
            haptic('success');
          },
        },
      ],
    );
  }

  return (
    <Screen edges={[]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void loadFeed()}
            tintColor={theme.brand.primary}
          />
        }
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing['5xl'],
          gap: spacing.md,
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: theme.text.primary,
                }}
              >
                Community
              </Text>
              <Text style={{ fontSize: 13, color: theme.text.tertiary, marginTop: 2 }}>
                See what workers around you are sharing
              </Text>
            </View>

            {/* Composer prompt */}
            <View
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.md,
                gap: spacing.md,
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 2,
              }}
            >
              <Pressable
                onPress={() => openComposer()}
                accessibilityRole="button"
                accessibilityLabel="Create a post"
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Avatar name={me.name} photoUrl={me.photoUrl} size={40} />
                <View
                  style={{
                    flex: 1,
                    height: 40,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.pill,
                    borderWidth: 0.5,
                    borderColor: theme.border.default,
                  }}
                >
                  <Text style={{ fontSize: 13, color: theme.text.tertiary }}>
                    Share an update, photo or certificate…
                  </Text>
                </View>
              </Pressable>
              <View
                style={{
                  flexDirection: 'row',
                  borderTopWidth: 0.5,
                  borderTopColor: theme.border.subtle,
                  paddingTop: spacing.xs,
                }}
              >
                <QuickAction icon="camera" label="Photo" onPress={() => openComposer('photo')} />
                <QuickAction icon="video" label="Video" onPress={() => openComposer('video')} />
                <QuickAction
                  icon="award"
                  label="Certificate"
                  onPress={() => openComposer('certificate')}
                />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onOpen={() => {
              haptic('selection');
              navigation.navigate('CommunityPost', { postId: item.id });
            }}
            onRepost={() => onRepost(item)}
          />
        )}
      />
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: spacing.sm,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Feather name={icon} size={15} color={theme.brand.primary} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: theme.text.secondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CommunityScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
