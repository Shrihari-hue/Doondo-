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
import { Feather } from '@expo/vector-icons';

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
  mediaUris: string[];
  certificateTitle?: string;
}

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here
const GREEN = '#16A34A';

/** Bar heights for the voice-note waveform. */
const VOICE_BARS = [8, 16, 24, 12, 20, 28, 14, 22, 10, 18, 26, 12, 20, 16, 9, 22, 14];

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
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <Pressable
        onPress={onOpen}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ padding: spacing.md }}>
          {post.reshared ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: spacing.xs,
                }}
              >
                <Feather name="repeat" size={12} color={theme.text.tertiary} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}>
                  {firstName(post.author.name)} reposted
                </Text>
              </View>
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
  const uris = media.mediaUris ?? [];

  if (media.type === 'text') return null;

  // ── Voice note — a play button + waveform bar ──────────────────────────────
  if (media.type === 'voice') {
    return (
      <View
        style={{
          marginTop: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.voice + '4D',
          backgroundColor: theme.voice + '1A',
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.voice,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="play" size={18} color={theme.text.onBrand} style={{ marginLeft: 2 }} />
        </View>
        <View
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          {VOICE_BARS.map((h, i) => (
            <View
              key={i}
              style={{
                width: 3,
                height: h,
                borderRadius: 2,
                backgroundColor: theme.voice,
                opacity: 0.55,
              }}
            />
          ))}
        </View>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.secondary }}>
          Voice note
        </Text>
      </View>
    );
  }

  // ── Resume — a document card ───────────────────────────────────────────────
  if (media.type === 'resume') {
    if (uris[0]) {
      return (
        <Image
          source={{ uri: uris[0] }}
          style={{
            marginTop: spacing.md,
            width: '100%',
            aspectRatio: 1,
            borderRadius: radii.lg,
          }}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        style={{
          marginTop: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          backgroundColor: theme.bg.surface,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            backgroundColor: theme.status.successSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="file-text" size={22} color={GREEN} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>
            Resume
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
            Tap to view this worker's resume
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={theme.text.tertiary} />
      </View>
    );
  }

  // ── Certificate — image (optional) + gold title strip ──────────────────────
  if (media.type === 'certificate') {
    return (
      <View
        style={{
          marginTop: spacing.md,
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: theme.status.warningBorder,
        }}
      >
        {uris[0] ? (
          <Image
            source={{ uri: uris[0] }}
            style={{ width: '100%', aspectRatio: 1 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 130,
              backgroundColor: theme.status.warningSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="award" size={36} color={theme.status.warning} />
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: spacing.md,
            backgroundColor: theme.status.warningSubtle,
          }}
        >
          <Feather name="award" size={16} color={theme.status.warning} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1,
                color: theme.status.warning,
              }}
            >
              CERTIFICATE
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: '700', color: theme.status.warning }}
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

  // ── No media yet — a tasteful placeholder panel ────────────────────────────
  if (uris.length === 0) {
    return (
      <View
        style={{
          marginTop: spacing.md,
          height: 200,
          borderRadius: radii.lg,
          overflow: 'hidden',
          backgroundColor: theme.brand.primarySubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={isVideo ? 'film' : 'image'} size={36} color={theme.text.tertiary} />
        <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 4 }}>
          {isVideo ? 'Video' : 'Photo'}
        </Text>
        {isVideo ? <PlayOverlay /> : null}
      </View>
    );
  }

  // ── Video — poster image + play overlay ────────────────────────────────────
  if (isVideo) {
    return (
      <View
        style={{ marginTop: spacing.md, borderRadius: radii.lg, overflow: 'hidden' }}
      >
        <Image
          source={{ uri: uris[0] }}
          style={{ width: '100%', aspectRatio: 1 }}
          resizeMode="cover"
        />
        <PlayOverlay />
      </View>
    );
  }

  // ── Photo — single full image, or a 2-column grid ──────────────────────────
  if (uris.length === 1) {
    return (
      <Image
        source={{ uri: uris[0] }}
        style={{
          marginTop: spacing.md,
          width: '100%',
          aspectRatio: 1,
          borderRadius: radii.lg,
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={{
        marginTop: spacing.md,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 6,
      }}
    >
      {uris.slice(0, 4).map((u, i) => {
        const overflow = i === 3 && uris.length > 4;
        return (
          <View
            key={`${i}-${u.slice(-12)}`}
            style={{
              width: '48.5%',
              aspectRatio: 1,
              borderRadius: radii.lg,
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
                <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>
                  +{uris.length - 4}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** The translucent circular play button laid over video media. */
function PlayOverlay() {
  return (
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
        <Feather name="play" size={24} color="#FFFFFF" style={{ marginLeft: 3 }} />
      </View>
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
          color: active ? theme.brand.primary : theme.text.secondary,
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
