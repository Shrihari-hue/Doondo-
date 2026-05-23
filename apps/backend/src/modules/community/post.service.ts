/**
 * Community feed service — create posts, read the feed, and handle the
 * engagement actions (like, comment, reply, repost).
 *
 * Every read returns a fully-hydrated `PublicPost`: authors (for the
 * post, its comments, its replies and any reshared original) are joined
 * in one extra query so the mobile feed renders without N+1 lookups.
 */

import { Types } from 'mongoose';
import { AppError } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { PostModel, type PostType } from './post.model';

// ─── Public shapes (what the mobile client receives) ─────────────────────────

export interface PublicAuthor {
  id: string;
  name: string;
  photoUrl: string | null;
  /** Short trade/role line, derived from the worker's first skill. */
  headline: string | null;
}

export interface PublicReply {
  id: string;
  author: PublicAuthor;
  text: string;
  createdAt: string;
}

export interface PublicComment {
  id: string;
  author: PublicAuthor;
  text: string;
  createdAt: string;
  replies: PublicReply[];
}

export interface PublicReshared {
  author: PublicAuthor;
  type: PostType;
  text: string;
  mediaUrl: string | null;
  certificateTitle: string | null;
  createdAt: string;
}

export interface PublicPost {
  id: string;
  author: PublicAuthor;
  type: PostType;
  text: string;
  mediaUrl: string | null;
  certificateTitle: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  comments: PublicComment[];
  repostCount: number;
  reshared: PublicReshared | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function notFound(): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Post not found',
    status: 404,
  });
}

function headlineFor(skills: unknown): string | null {
  if (!Array.isArray(skills) || skills.length === 0) return null;
  const first = String(skills[0] ?? '').trim();
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function fallbackAuthor(id: unknown): PublicAuthor {
  return { id: String(id), name: 'Doondo worker', photoUrl: null, headline: null };
}

type AuthorMap = Map<string, PublicAuthor>;

/** Join the User collection for every author referenced by these posts. */
async function hydrateAuthors(posts: Array<Record<string, unknown>>): Promise<AuthorMap> {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (v !== undefined && v !== null) ids.add(String(v));
  };
  for (const p of posts) {
    add(p.authorId);
    const reshared = p.reshared as { authorId?: unknown } | null | undefined;
    if (reshared) add(reshared.authorId);
    const comments = (p.comments as Array<Record<string, unknown>>) ?? [];
    for (const c of comments) {
      add(c.authorId);
      const replies = (c.replies as Array<Record<string, unknown>>) ?? [];
      for (const r of replies) add(r.authorId);
    }
  }

  const map: AuthorMap = new Map();
  if (ids.size === 0) return map;

  const users = await UserModel.find({ _id: { $in: [...ids] } })
    .select('name photoUrl skills')
    .lean();
  for (const u of users) {
    map.set(String(u._id), {
      id: String(u._id),
      name: (u.name as string) ?? 'Doondo worker',
      photoUrl: (u.photoUrl as string | null) ?? null,
      headline: headlineFor(u.skills),
    });
  }
  return map;
}

function authorOf(map: AuthorMap, id: unknown): PublicAuthor {
  return map.get(String(id)) ?? fallbackAuthor(id);
}

function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : new Date(String(d)).toISOString();
}

/** Map a raw post document into the hydrated public shape. */
function toPublic(
  post: Record<string, unknown>,
  authors: AuthorMap,
  viewerId: string,
): PublicPost {
  const likes = (post.likes as unknown[]) ?? [];
  const reshared = post.reshared as Record<string, unknown> | null | undefined;
  const comments = (post.comments as Array<Record<string, unknown>>) ?? [];

  return {
    id: String(post._id),
    author: authorOf(authors, post.authorId),
    type: post.type as PostType,
    text: (post.text as string) ?? '',
    mediaUrl: (post.mediaUrl as string | null) ?? null,
    certificateTitle: (post.certificateTitle as string | null) ?? null,
    createdAt: toIso(post.createdAt),
    likeCount: likes.length,
    likedByMe: likes.some((id) => String(id) === viewerId),
    repostCount: (post.repostCount as number) ?? 0,
    comments: comments.map((c) => ({
      id: String(c._id),
      author: authorOf(authors, c.authorId),
      text: (c.text as string) ?? '',
      createdAt: toIso(c.createdAt),
      replies: (((c.replies as Array<Record<string, unknown>>) ?? []).map((r) => ({
        id: String(r._id),
        author: authorOf(authors, r.authorId),
        text: (r.text as string) ?? '',
        createdAt: toIso(r.createdAt),
      }))),
    })),
    reshared: reshared
      ? {
          author: authorOf(authors, reshared.authorId),
          type: reshared.type as PostType,
          text: (reshared.text as string) ?? '',
          mediaUrl: (reshared.mediaUrl as string | null) ?? null,
          certificateTitle: (reshared.certificateTitle as string | null) ?? null,
          createdAt: toIso(reshared.createdAt),
        }
      : null,
  };
}

// ─── reads ───────────────────────────────────────────────────────────────────

/** The Community feed — newest posts first, fully hydrated. */
export async function listFeed(viewerId: string, limit: number): Promise<PublicPost[]> {
  const posts = await PostModel.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 50))
    .lean();
  const authors = await hydrateAuthors(posts as Array<Record<string, unknown>>);
  return (posts as Array<Record<string, unknown>>).map((p) =>
    toPublic(p, authors, viewerId),
  );
}

/** A single post, hydrated — used after every mutation. */
export async function getPublicPost(
  postId: string,
  viewerId: string,
): Promise<PublicPost> {
  const post = await PostModel.findById(postId).lean();
  if (!post) throw notFound();
  const authors = await hydrateAuthors([post as Record<string, unknown>]);
  return toPublic(post as Record<string, unknown>, authors, viewerId);
}

// ─── writes ──────────────────────────────────────────────────────────────────

export async function createPost(input: {
  authorId: string;
  type: PostType;
  text: string;
  mediaDataUrl: string | null;
  certificateTitle: string | null;
}): Promise<PublicPost> {
  const doc = await PostModel.create({
    authorId: new Types.ObjectId(input.authorId),
    type: input.type,
    text: input.text,
    mediaUrl: input.mediaDataUrl,
    certificateTitle:
      input.type === 'certificate' ? input.certificateTitle : null,
  });
  return getPublicPost(String(doc._id), input.authorId);
}

/** Toggle the viewer's like on a post. */
export async function toggleLike(
  postId: string,
  viewerId: string,
): Promise<PublicPost> {
  const post = await PostModel.findById(postId).select('likes').lean();
  if (!post) throw notFound();
  const likes = ((post as Record<string, unknown>).likes as unknown[]) ?? [];
  const liked = likes.some((id) => String(id) === viewerId);
  await PostModel.updateOne(
    { _id: postId },
    liked
      ? { $pull: { likes: new Types.ObjectId(viewerId) } }
      : { $addToSet: { likes: new Types.ObjectId(viewerId) } },
  );
  return getPublicPost(postId, viewerId);
}

export async function addComment(
  postId: string,
  viewerId: string,
  text: string,
): Promise<PublicPost> {
  const result = await PostModel.updateOne(
    { _id: postId },
    {
      $push: {
        comments: {
          authorId: new Types.ObjectId(viewerId),
          text,
          createdAt: new Date(),
          replies: [],
        },
      },
    },
  );
  if (result.matchedCount === 0) throw notFound();
  return getPublicPost(postId, viewerId);
}

export async function addReply(
  postId: string,
  commentId: string,
  viewerId: string,
  text: string,
): Promise<PublicPost> {
  const result = await PostModel.updateOne(
    { _id: postId },
    {
      $push: {
        'comments.$[c].replies': {
          authorId: new Types.ObjectId(viewerId),
          text,
          createdAt: new Date(),
        },
      },
    },
    { arrayFilters: [{ 'c._id': new Types.ObjectId(commentId) }] },
  );
  if (result.matchedCount === 0) throw notFound();
  return getPublicPost(postId, viewerId);
}

/** Repost — create the viewer's own post wrapping a snapshot of the original. */
export async function repost(postId: string, viewerId: string): Promise<PublicPost> {
  const original = await PostModel.findById(postId).lean();
  if (!original) throw notFound();
  const o = original as Record<string, unknown>;

  // Reposting a repost reshares the underlying original — never nest.
  const existing = o.reshared as Record<string, unknown> | null | undefined;
  const snapshot = existing
    ? {
        authorId: new Types.ObjectId(String(existing.authorId)),
        type: existing.type as PostType,
        text: (existing.text as string) ?? '',
        mediaUrl: (existing.mediaUrl as string | null) ?? null,
        certificateTitle: (existing.certificateTitle as string | null) ?? null,
        createdAt: existing.createdAt as Date,
      }
    : {
        authorId: new Types.ObjectId(String(o.authorId)),
        type: o.type as PostType,
        text: (o.text as string) ?? '',
        mediaUrl: (o.mediaUrl as string | null) ?? null,
        certificateTitle: (o.certificateTitle as string | null) ?? null,
        createdAt: o.createdAt as Date,
      };

  const doc = await PostModel.create({
    authorId: new Types.ObjectId(viewerId),
    type: 'text',
    text: '',
    reshared: snapshot,
  });
  await PostModel.updateOne({ _id: postId }, { $inc: { repostCount: 1 } });
  return getPublicPost(String(doc._id), viewerId);
}
