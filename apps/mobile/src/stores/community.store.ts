/**
 * Community feed store — state for the Community tab's LinkedIn-style feed.
 *
 * This store is the UI's source of truth for `posts`. It is backed by
 * the real backend (`communityApi`):
 *   - `loadFeed()` pulls the feed from the server.
 *   - mutations update the UI optimistically (instant feel) and then
 *     fire the API call, reconciling with the server's response.
 *
 * It also ships a seed feed. The seed is the *offline fallback*: if the
 * backend can't be reached, `loadFeed` leaves the seed in place so the
 * tab is never blank. Seed posts have local ids, so mutations on them
 * stay purely local (no pointless 404s).
 */
import { create } from 'zustand';
import { communityApi, type ApiPost } from '@/api/community.api';

export type PostType =
  | 'text'
  | 'photo'
  | 'video'
  | 'certificate'
  | 'resume'
  | 'voice';

export interface FeedAuthor {
  name: string;
  /** Matches the app's user.photoUrl, which can be null. */
  photoUrl?: string | null;
}

export interface FeedReply {
  id: string;
  author: FeedAuthor;
  text: string;
  createdAt: number;
}

export interface FeedComment {
  id: string;
  author: FeedAuthor;
  text: string;
  createdAt: number;
  replies: FeedReply[];
}

/** The original post carried inside a repost. */
export interface ResharedPost {
  author: FeedAuthor;
  headline?: string;
  type: PostType;
  text: string;
  mediaUris: string[];
  certificateTitle?: string;
  createdAt: number;
}

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  /** A short role/trade line under the author's name. */
  headline?: string;
  /** True when the signed-in worker is the author. */
  authorIsMe: boolean;
  type: PostType;
  text: string;
  /** Image URIs / data URLs — photos, video poster, certificate, resume. */
  mediaUris: string[];
  /** Title shown on a certificate post. */
  certificateTitle?: string;
  createdAt: number;
  likeCount: number;
  likedByMe: boolean;
  comments: FeedComment[];
  repostCount: number;
  /** Present when this post is a repost of someone else's post. */
  reshared?: ResharedPost;
}

export interface NewPostInput {
  author: FeedAuthor;
  headline?: string;
  type: PostType;
  text: string;
  mediaUris: string[];
  certificateTitle?: string;
}

interface CommunityState {
  posts: FeedPost[];
  loading: boolean;
  loaded: boolean;
  loadFeed: () => Promise<void>;
  addPost: (input: NewPostInput) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, author: FeedAuthor, text: string) => void;
  addReply: (
    postId: string,
    commentId: string,
    author: FeedAuthor,
    text: string,
  ) => void;
  repost: (postId: string, author: FeedAuthor, headline?: string) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/** A real backend id is a 24-char hex ObjectId; seed/temp ids are not. */
function isRealId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

function toMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Date.now() : t;
}

/** Short relative time, e.g. "just now", "3h", "2d". */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  return `${wk}w`;
}

/** Map a backend post into the store's UI shape. */
function fromApi(p: ApiPost): FeedPost {
  return {
    id: p.id,
    author: { name: p.author.name, photoUrl: p.author.photoUrl },
    headline: p.author.headline ?? undefined,
    authorIsMe: false,
    type: p.type,
    text: p.text,
    mediaUris: p.mediaUrls,
    certificateTitle: p.certificateTitle ?? undefined,
    createdAt: toMs(p.createdAt),
    likeCount: p.likeCount,
    likedByMe: p.likedByMe,
    repostCount: p.repostCount,
    comments: p.comments.map((c) => ({
      id: c.id,
      author: { name: c.author.name, photoUrl: c.author.photoUrl },
      text: c.text,
      createdAt: toMs(c.createdAt),
      replies: c.replies.map((r) => ({
        id: r.id,
        author: { name: r.author.name, photoUrl: r.author.photoUrl },
        text: r.text,
        createdAt: toMs(r.createdAt),
      })),
    })),
    reshared: p.reshared
      ? {
          author: {
            name: p.reshared.author.name,
            photoUrl: p.reshared.author.photoUrl,
          },
          headline: p.reshared.author.headline ?? undefined,
          type: p.reshared.type,
          text: p.reshared.text,
          mediaUris: p.reshared.mediaUrls,
          certificateTitle: p.reshared.certificateTitle ?? undefined,
          createdAt: toMs(p.reshared.createdAt),
        }
      : undefined,
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Seed feed — the offline fallback. Worker-positive posts that show
 * every post type plus comments and replies. Media is left empty on
 * purpose; the post card draws a tasteful placeholder panel.
 */
function seedPosts(): FeedPost[] {
  const now = Date.now();
  return [
    {
      id: makeId('post'),
      author: { name: 'Priya Sharma' },
      headline: 'Electrician · Pune',
      authorIsMe: false,
      type: 'certificate',
      text: 'Proud to share that I passed my electrical safety certification today! Thank you to everyone on Doondo who guided me along the way.',
      certificateTitle: 'Electrical Safety — Level 2 Certified',
      mediaUris: [],
      createdAt: now - 3 * HOUR,
      likeCount: 24,
      likedByMe: false,
      repostCount: 3,
      comments: [
        {
          id: makeId('c'),
          author: { name: 'Ravi Kumar' },
          text: 'Congratulations Priya! Well deserved.',
          createdAt: now - 2 * HOUR,
          replies: [
            {
              id: makeId('r'),
              author: { name: 'Priya Sharma' },
              text: 'Thank you Ravi!',
              createdAt: now - 1 * HOUR,
            },
          ],
        },
      ],
    },
    {
      id: makeId('post'),
      author: { name: 'Ravi Kumar' },
      headline: 'Delivery partner · Bengaluru',
      authorIsMe: false,
      type: 'text',
      text: 'Completed my 500th delivery this month. Slow and steady — every order counts. Grateful for the regular customers who now know me by name.',
      mediaUris: [],
      createdAt: now - 8 * HOUR,
      likeCount: 41,
      likedByMe: true,
      repostCount: 1,
      comments: [
        {
          id: makeId('c'),
          author: { name: 'Anjali Devi' },
          text: 'Inspiring! Keep going.',
          createdAt: now - 6 * HOUR,
          replies: [],
        },
      ],
    },
    {
      id: makeId('post'),
      author: { name: 'Anjali Devi' },
      headline: 'Tailor · Hyderabad',
      authorIsMe: false,
      type: 'photo',
      text: 'Finished this bridal blouse today — three days of work, every thread by hand. So happy with how it turned out.',
      mediaUris: [],
      createdAt: now - 1 * DAY,
      likeCount: 67,
      likedByMe: false,
      repostCount: 5,
      comments: [
        {
          id: makeId('c'),
          author: { name: 'Priya Sharma' },
          text: 'Beautiful work!',
          createdAt: now - 20 * HOUR,
          replies: [],
        },
      ],
    },
    {
      id: makeId('post'),
      author: { name: 'Mohammed Iqbal' },
      headline: 'Plumber · Chennai',
      authorIsMe: false,
      type: 'video',
      text: 'Quick tip: how to stop a leaking tap in under two minutes. Save this for later!',
      mediaUris: [],
      createdAt: now - 2 * DAY,
      likeCount: 88,
      likedByMe: false,
      repostCount: 12,
      comments: [
        {
          id: makeId('c'),
          author: { name: 'Ravi Kumar' },
          text: 'Saved. Thanks for sharing this!',
          createdAt: now - 1 * DAY,
          replies: [],
        },
      ],
    },
  ];
}

// ─── store ───────────────────────────────────────────────────────────────────

export const useCommunityStore = create<CommunityState>((set) => ({
  posts: seedPosts(),
  loading: false,
  loaded: false,

  loadFeed: async () => {
    set({ loading: true });
    try {
      const { posts } = await communityApi.feed(40);
      set({ posts: posts.map(fromApi), loading: false, loaded: true });
    } catch {
      // Backend unreachable — keep the current feed (the seed) on screen
      // so the tab is never blank. The prototype works offline this way.
      set({ loading: false, loaded: true });
    }
  },

  addPost: (input) => {
    const tempId = makeId('post');
    const optimistic: FeedPost = {
      id: tempId,
      author: input.author,
      headline: input.headline,
      authorIsMe: true,
      type: input.type,
      text: input.text,
      mediaUris: input.mediaUris,
      certificateTitle: input.certificateTitle,
      createdAt: Date.now(),
      likeCount: 0,
      likedByMe: false,
      comments: [],
      repostCount: 0,
    };
    set((s) => ({ posts: [optimistic, ...s.posts] }));
    void communityApi
      .createPost({
        type: input.type,
        text: input.text,
        mediaDataUrls: input.mediaUris,
        certificateTitle: input.certificateTitle ?? null,
      })
      .then(({ post }) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === tempId ? fromApi(post) : p)),
        })),
      )
      .catch(() => undefined);
  },

  toggleLike: (postId) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
            }
          : p,
      ),
    }));
    if (!isRealId(postId)) return;
    void communityApi
      .like(postId)
      .then(({ post }) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === postId ? fromApi(post) : p)),
        })),
      )
      .catch(() => undefined);
  },

  addComment: (postId, author, text) => {
    const tempId = makeId('c');
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [
                ...p.comments,
                { id: tempId, author, text, createdAt: Date.now(), replies: [] },
              ],
            }
          : p,
      ),
    }));
    if (!isRealId(postId)) return;
    void communityApi
      .comment(postId, text)
      .then(({ post }) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === postId ? fromApi(post) : p)),
        })),
      )
      .catch(() => undefined);
  },

  addReply: (postId, commentId, author, text) => {
    const tempId = makeId('r');
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: p.comments.map((c) =>
                c.id === commentId
                  ? {
                      ...c,
                      replies: [
                        ...c.replies,
                        { id: tempId, author, text, createdAt: Date.now() },
                      ],
                    }
                  : c,
              ),
            }
          : p,
      ),
    }));
    if (!isRealId(postId) || !isRealId(commentId)) return;
    void communityApi
      .reply(postId, commentId, text)
      .then(({ post }) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === postId ? fromApi(post) : p)),
        })),
      )
      .catch(() => undefined);
  },

  repost: (postId, author, headline) => {
    const tempId = makeId('post');
    set((s) => {
      const original = s.posts.find((p) => p.id === postId);
      if (!original) return {};
      // Reposting a repost reshares the underlying original — never nest.
      const source: ResharedPost = original.reshared ?? {
        author: original.author,
        headline: original.headline,
        type: original.type,
        text: original.text,
        mediaUris: original.mediaUris,
        certificateTitle: original.certificateTitle,
        createdAt: original.createdAt,
      };
      const repostPost: FeedPost = {
        id: tempId,
        author,
        headline,
        authorIsMe: true,
        type: 'text',
        text: '',
        mediaUris: [],
        createdAt: Date.now(),
        likeCount: 0,
        likedByMe: false,
        comments: [],
        repostCount: 0,
        reshared: source,
      };
      return {
        posts: [
          repostPost,
          ...s.posts.map((p) =>
            p.id === postId ? { ...p, repostCount: p.repostCount + 1 } : p,
          ),
        ],
      };
    });
    if (!isRealId(postId)) return;
    void communityApi
      .repost(postId)
      .then(({ post }) =>
        set((s) => ({
          posts: s.posts.map((p) => (p.id === tempId ? fromApi(post) : p)),
        })),
      )
      .catch(() => undefined);
  },
}));
