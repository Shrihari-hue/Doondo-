/**
 * CommunityPostScreen — modal showing one post with its full comment
 * thread. Workers can like and repost the post (via the embedded
 * PostCard), comment on it, and reply to individual comments.
 */
import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import {
  useCommunityStore,
  timeAgo,
  type FeedComment,
  type FeedAuthor,
} from '@/stores/community.store';
import { PostCard } from '@/screens/community/PostCard';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'CommunityPost'>;

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const post = useCommunityStore((s) =>
    s.posts.find((p) => p.id === route.params.postId),
  );
  const addComment = useCommunityStore((s) => s.addComment);
  const addReply = useCommunityStore((s) => s.addReply);
  const repost = useCommunityStore((s) => s.repost);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ commentId: string; name: string } | null>(
    null,
  );

  const me: FeedAuthor = {
    name: user?.name ?? 'You',
    photoUrl: user?.photoUrl,
  };
  const myHeadline = user?.skills?.[0]
    ? user.skills[0].charAt(0).toUpperCase() + user.skills[0].slice(1)
    : undefined;

  function header() {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}>
          Post
        </Text>
      </View>
    );
  }

  if (!post) {
    return (
      <Screen edges={[]}>
        {header()}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: theme.text.tertiary }}>
            This post is no longer available.
          </Text>
        </View>
      </Screen>
    );
  }

  function send() {
    const text = draft.trim();
    if (!text || !post) return;
    if (replyTo) {
      addReply(post.id, replyTo.commentId, me, text);
    } else {
      addComment(post.id, me, text);
    }
    haptic('success');
    setDraft('');
    setReplyTo(null);
  }

  function onRepost() {
    if (!post) return;
    Alert.alert('Repost', 'Share this post to your community profile?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Repost',
        onPress: () => {
          repost(post.id, me, myHeadline);
          haptic('success');
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {header()}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: spacing.lg,
            gap: spacing.lg,
            paddingBottom: spacing['3xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <PostCard
            post={post}
            onOpen={() => inputRef.current?.focus()}
            onRepost={onRepost}
          />

          <View style={{ gap: spacing.md }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.4,
                color: theme.text.tertiary,
              }}
            >
              COMMENTS
            </Text>

            {post.comments.length === 0 ? (
              <Text style={{ fontSize: 13, color: theme.text.tertiary }}>
                No comments yet. Be the first to say something.
              </Text>
            ) : (
              post.comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  onReply={() => {
                    setReplyTo({ commentId: c.id, name: c.author.name });
                    inputRef.current?.focus();
                  }}
                />
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment composer */}
        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: theme.border.subtle,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.sm,
            backgroundColor: theme.bg.surface,
          }}
        >
          {replyTo ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                Replying to {replyTo.name}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={{ fontSize: 12, color: theme.brand.primary }}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={
                replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'
              }
              placeholderTextColor={theme.text.tertiary}
              style={{
                flex: 1,
                maxHeight: 110,
                fontSize: 14,
                color: theme.text.primary,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                textAlignVertical: 'center',
              }}
            />
            <Pressable
              onPress={send}
              disabled={draft.trim().length === 0}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: radii.pill,
                backgroundColor:
                  draft.trim().length > 0 ? theme.brand.primary : theme.border.default,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CommentItem({
  comment,
  onReply,
}: {
  comment: FeedComment;
  onReply: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Avatar name={comment.author.name} photoUrl={comment.author.photoUrl} size={32} />
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: theme.bg.canvas,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}
                numberOfLines={1}
              >
                {comment.author.name}
              </Text>
              <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                {timeAgo(comment.createdAt)}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                lineHeight: 19,
                color: theme.text.primary,
                marginTop: 2,
              }}
            >
              {comment.text}
            </Text>
          </View>
          <Pressable onPress={onReply} hitSlop={8} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.brand.primary }}>
              Reply
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Replies */}
      {comment.replies.length > 0 ? (
        <View style={{ paddingLeft: 40, gap: spacing.sm }}>
          {comment.replies.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Avatar name={r.author.name} photoUrl={r.author.photoUrl} size={26} />
              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.bg.canvas,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: theme.text.primary,
                    }}
                    numberOfLines={1}
                  >
                    {r.author.name}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.text.tertiary }}>
                    {timeAgo(r.createdAt)}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 18,
                    color: theme.text.primary,
                    marginTop: 2,
                  }}
                >
                  {r.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function CommunityPostScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
