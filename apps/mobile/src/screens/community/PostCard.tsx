/**
 * PostCard — one post in the Community feed (LinkedIn-style).
 *
 * Renders the author, the post text, any media (photo / video poster /
 * certificate panel), the engagement counts, and the like / comment /
 * repost action row. Reposts render the original inside a bordered
 * inner card.
 *
 * Like is handled here against the community store; comment and repost
 * are delegated to the parent via `onOpen` / `onRepost`.
 */
import { Image, Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Avatar, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import {
  useCommunityStore,
  timeAgo,
  type FeedPost,
  type FeedAuthor,
  type PostType,
} from '@/stores/community.store';

interface MediaShape {
  type: PostType;
  mediaUri?: string;
  certificateTitle?: string;
}

export function PostCard({
  post,
  onOpen,
  onRepost,
}: {
  post: FeedPost;
  onOpen: () => void;
  onRepost: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onOpen}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ padding: spacing.lg }}>
          {post.reshared ? (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: theme.text.tertiary,
                  marginBottom: spacing.xs,
                }}
              >
                🔁 {firstName(post.author.name)} reposted
              </Text>
              <AuthorRow
                author={post.author}
                headline={post.headline}
                createdAt={post.createdAt}
              />
              {post.text ? <PostText>{post.text}</PostText> : null}
              <View
                style={{
                  marginTop: spacing.md,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                }}
              >
                <AuthorRow
                  author={post.reshared.author}
                  headline={post.reshared.headline}
                  createdAt={post.reshared.createdAt}
                  compact
                />
                {post.reshared.text ? (
                  <PostText small>{post.reshared.text}</PostText>
                ) : null}
                <PostMedia media={post.reshared} />
              </View>
            </>
          ) : (
            <>
              <AuthorRow
                author={post.author}
                headline={post.headline}
                createdAt={post.createdAt}
              />
              {post.text ? <PostText>{post.text}</PostText> : null}
              <PostMedia media={post} />
            </>
          )}
          <CountsLine post={post} />
        </View>
      </Pressable>

      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xs }}>
        <ActionRow post={post} onOpen={onOpen} onRepost={onRepost} />
      </View>
    </View>
  );
}

// ─── pieces ──────────────────────────────────────────────────────────────────

export function AuthorRow({
  author,
  headline,
  createdAt,
  compact,
}: {
  author: FeedAuthor;
  headline?: string;
  createdAt: number;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Avatar name={author.name} photoUrl={author.photoUrl} size={compact ? 36 : 44} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: compact ? 13 : 15,
            fontWeight: '700',
            color: theme.text.primary,
          }}
          numberOfLines={1}
        >
          {author.name}
        </Text>
        {headline ? (
          <Text style={{ fontSize: 12, color: theme.text.secondary }} numberOfLines={1}>
            {headline}
          </Text>
        ) : null}
        <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
          {timeAgo(createdAt)}
        </Text>
      </View>
    </View>
  );
}

function PostText({ children, small }: { children: string; small?: boolean }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        marginTop: spacing.sm,
        fontSize: small ? 13 : 14,
        lineHeight: small ? 19 : 21,
        color: theme.text.primary,
      }}
    >
      {children}
    </Text>
  );
}

export function PostMedia({ media }: { media: MediaShape }) {
  const { theme } = useTheme();
  if (media.type === 'text') return null;

  if (media.type === 'certificate') {
    return (
      <View
        style={{
          marginTop: spacing.md,
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: '#E4C063',
        }}
      >
        {media.mediaUri ? (
          <Image
            source={{ uri: media.mediaUri }}
            style={{ width: '100%', aspectRatio: 1 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 130,
              backgroundColor: '#FBF3DC',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 40 }}>🎓</Text>
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: spacing.md,
            backgroundColor: '#FBF3DC',
          }}
        >
          <Text style={{ fontSize: 18 }}>📜</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1,
                color: '#8A6D1A',
              }}
            >
              CERTIFICATE
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: '700', color: '#5C4708' }}
              numberOfLines={2}
            >
              {media.certificateTitle ?? 'Certificate'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const isVideo = media.type === 'video';
  return (
    <View
      style={{ marginTop: spacing.md, borderRadius: radii.lg, overflow: 'hidden' }}
    >
      {media.mediaUri ? (
        <Image
          source={{ uri: media.mediaUri }}
          style={{ width: '100%', aspectRatio: 1 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 200,
            backgroundColor: theme.brand.heroSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 44 }}>{isVideo ? '🎬' : '🖼️'}</Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 4 }}>
            {isVideo ? 'Video' : 'Photo'}
          </Text>
        </View>
      )}
      {isVideo ? (
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
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#FFFFFF', marginLeft: 3 }}>▶</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CountsLine({ post }: { post: FeedPost }) {
  const { theme } = useTheme();
  const parts: string[] = [];
  if (post.likeCount > 0) {
    parts.push(`${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'}`);
  }
  if (post.comments.length > 0) {
    parts.push(
      `${post.comments.length} ${post.comments.length === 1 ? 'comment' : 'comments'}`,
    );
  }
  if (post.repostCount > 0) {
    parts.push(
      `${post.repostCount} ${post.repostCount === 1 ? 'repost' : 'reposts'}`,
    );
  }
  if (parts.length === 0) return null;
  return (
    <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: spacing.md }}>
      {parts.join('  ·  ')}
    </Text>
  );
}

function ActionRow({
  post,
  onOpen,
  onRepost,
}: {
  post: FeedPost;
  onOpen: () => void;
  onRepost: () => void;
}) {
  const { theme } = useTheme();
  const toggleLike = useCommunityStore((s) => s.toggleLike);
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 0.5,
        borderTopColor: theme.border.subtle,
      }}
    >
      <ActionButton
        glyph="👍"
        label={post.likedByMe ? 'Liked' : 'Like'}
        active={post.likedByMe}
        onPress={() => {
          haptic('selection');
          toggleLike(post.id);
        }}
      />
      <ActionButton glyph="💬" label="Comment" onPress={onOpen} />
      <ActionButton
        glyph="🔁"
        label="Repost"
        onPress={() => {
          haptic('selection');
          onRepost();
        }}
      />
    </View>
  );
}

function ActionButton({
  glyph,
  label,
  active,
  onPress,
}: {
  glyph: string;
  label: string;
  active?: boolean;
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
        paddingVertical: spacing.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 15 }}>{glyph}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '700' : '500',
          color: active ? theme.brand.hero : theme.text.secondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}
