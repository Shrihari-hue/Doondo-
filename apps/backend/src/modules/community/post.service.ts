/**
 * Community feed service — create posts, read the feed, and handle the
 * engagement actions (like, comment, reply, repost).
 *
 * Every read returns a fully-hydrated `PublicPost`: authors (for the
 * post, its comments, its replies and any reshared original) are joined
 * in one extra query so the mobile feed renders without N+1 lookups.
 *
 * Comments/replies are jsonb (mirrors the old Mongo embedded-subdocument
 * shape — bounded, single round-trip reads) with app-generated UUIDs
 * standing in for Mongo's auto _id. Likes are a plain uuid[] column.
 */

import { randomUUID } from 'node:crypto';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { getDb } from '@/db/client';
import {
  communityPosts,
  users,
  type PostCommentJson,
  type PostReplyJson,
  type ResharedSnapshotJson,
} from '@/db/schema';

export type PostType = (typeof communityPosts.$inferSelect)['type'];

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
  mediaUrls: string[];
  certificateTitle: string | null;
  createdAt: string;
}

export interface PublicPost {
  id: string;
  author: PublicAuthor;
  type: PostType;
  text: string;
  mediaUrls: string[];
  certificateTitle: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  comments: PublicComment[];
  repostCount: number;
  reshared: PublicReshared | null;
}

type PostRow = typeof communityPosts.$inferSelect;

// ─── helpers ─────────────────────────────────────────────────────────────────

function notFound(): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Post not found',
    status: 404,
  });
}

function headlineFor(skills: string[] | null | undefined): string | null {
  if (!Array.isArray(skills) || skills.length === 0) return null;
  const first = String(skills[0] ?? '').trim();
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function fallbackAuthor(id: string): PublicAuthor {
  return { id, name: 'Doondo worker', photoUrl: null, headline: null };
}

type AuthorMap = Map<string, PublicAuthor>;

/** Join the users table for every author referenced by these posts. */
async function hydrateAuthors(posts: PostRow[]): Promise<AuthorMap> {
  const ids = new Set<string>();
  for (const p of posts) {
    ids.add(p.authorId);
    if (p.reshared) ids.add(p.reshared.authorId);
    for (const c of p.comments) {
      ids.add(c.authorId);
      for (const r of c.replies) ids.add(r.authorId);
    }
  }

  const map: AuthorMap = new Map();
  if (ids.size === 0) return map;

  const rows = await getDb()
    .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, skills: users.skills })
    .from(users)
    .where(inArray(users.id, [...ids]));
  for (const u of rows) {
    map.set(u.id, {
      id: u.id,
      name: u.name ?? 'Doondo worker',
      photoUrl: u.photoUrl ?? null,
      headline: headlineFor(u.skills),
    });
  }
  return map;
}

function authorOf(map: AuthorMap, id: string): PublicAuthor {
  return map.get(id) ?? fallbackAuthor(id);
}

/** Map a raw post row into the hydrated public shape. */
function toPublic(post: PostRow, authors: AuthorMap, viewerId: string): PublicPost {
  return {
    id: post.id,
    author: authorOf(authors, post.authorId),
    type: post.type,
    text: post.text,
    mediaUrls: post.mediaUrls,
    certificateTitle: post.certificateTitle ?? null,
    createdAt: post.createdAt.toISOString(),
    likeCount: post.likes.length,
    likedByMe: post.likes.includes(viewerId),
    repostCount: post.repostCount,
    comments: post.comments.map((c) => ({
      id: c.id,
      author: authorOf(authors, c.authorId),
      text: c.text,
      createdAt: c.createdAt,
      replies: c.replies.map((r) => ({
        id: r.id,
        author: authorOf(authors, r.authorId),
        text: r.text,
        createdAt: r.createdAt,
      })),
    })),
    reshared: post.reshared
      ? {
          author: authorOf(authors, post.reshared.authorId),
          type: post.reshared.type as PostType,
          text: post.reshared.text,
          mediaUrls: post.reshared.mediaUrls,
          certificateTitle: post.reshared.certificateTitle,
          createdAt: post.reshared.createdAt,
        }
      : null,
  };
}

// ─── reads ───────────────────────────────────────────────────────────────────

/** The Community feed — newest posts first, fully hydrated. */
export async function listFeed(viewerId: string, limit: number): Promise<PublicPost[]> {
  const posts = await getDb()
    .select()
    .from(communityPosts)
    .orderBy(desc(communityPosts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  const authors = await hydrateAuthors(posts);
  return posts.map((p) => toPublic(p, authors, viewerId));
}

/** A single post, hydrated — used after every mutation. */
export async function getPublicPost(postId: string, viewerId: string): Promise<PublicPost> {
  const [post] = await getDb().select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
  if (!post) throw notFound();
  const authors = await hydrateAuthors([post]);
  return toPublic(post, authors, viewerId);
}

// ─── writes ──────────────────────────────────────────────────────────────────

export async function createPost(input: {
  authorId: string;
  type: PostType;
  text: string;
  mediaDataUrls: string[];
  certificateTitle: string | null;
}): Promise<PublicPost> {
  const [doc] = await getDb()
    .insert(communityPosts)
    .values({
      authorId: input.authorId,
      type: input.type,
      text: input.text,
      mediaUrls: input.mediaDataUrls,
      certificateTitle: input.type === 'certificate' ? input.certificateTitle : null,
    })
    .returning();
  return getPublicPost(doc!.id, input.authorId);
}

/** Toggle the viewer's like on a post. */
export async function toggleLike(postId: string, viewerId: string): Promise<PublicPost> {
  const [post] = await getDb()
    .select({ likes: communityPosts.likes })
    .from(communityPosts)
    .where(eq(communityPosts.id, postId))
    .limit(1);
  if (!post) throw notFound();
  const liked = post.likes.includes(viewerId);
  await getDb()
    .update(communityPosts)
    .set({
      likes: liked
        ? sql`array_remove(${communityPosts.likes}, ${viewerId})`
        : sql`array_append(${communityPosts.likes}, ${viewerId}::uuid)`,
    })
    .where(eq(communityPosts.id, postId));
  return getPublicPost(postId, viewerId);
}

export async function addComment(
  postId: string,
  viewerId: string,
  text: string,
): Promise<PublicPost> {
  const [post] = await getDb()
    .select({ comments: communityPosts.comments })
    .from(communityPosts)
    .where(eq(communityPosts.id, postId))
    .limit(1);
  if (!post) throw notFound();
  const newComment: PostCommentJson = {
    id: randomUUID(),
    authorId: viewerId,
    text,
    replies: [],
    createdAt: new Date().toISOString(),
  };
  await getDb()
    .update(communityPosts)
    .set({ comments: [...post.comments, newComment] })
    .where(eq(communityPosts.id, postId));
  return getPublicPost(postId, viewerId);
}

export async function addReply(
  postId: string,
  commentId: string,
  viewerId: string,
  text: string,
): Promise<PublicPost> {
  const [post] = await getDb()
    .select({ comments: communityPosts.comments })
    .from(communityPosts)
    .where(eq(communityPosts.id, postId))
    .limit(1);
  if (!post) throw notFound();
  const idx = post.comments.findIndex((c) => c.id === commentId);
  if (idx === -1) throw notFound();
  const newReply: PostReplyJson = {
    id: randomUUID(),
    authorId: viewerId,
    text,
    createdAt: new Date().toISOString(),
  };
  const comments = [...post.comments];
  comments[idx] = { ...comments[idx]!, replies: [...comments[idx]!.replies, newReply] };
  await getDb().update(communityPosts).set({ comments }).where(eq(communityPosts.id, postId));
  return getPublicPost(postId, viewerId);
}

/** Repost — create the viewer's own post wrapping a snapshot of the original. */
export async function repost(postId: string, viewerId: string): Promise<PublicPost> {
  const [original] = await getDb().select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
  if (!original) throw notFound();

  // Reposting a repost reshares the underlying original — never nest.
  const snapshot: ResharedSnapshotJson = original.reshared ?? {
    authorId: original.authorId,
    type: original.type,
    text: original.text,
    mediaUrls: original.mediaUrls,
    certificateTitle: original.certificateTitle,
    createdAt: original.createdAt.toISOString(),
  };

  const [doc] = await getDb()
    .insert(communityPosts)
    .values({ authorId: viewerId, type: 'text', text: '', reshared: snapshot })
    .returning();
  await getDb()
    .update(communityPosts)
    .set({ repostCount: sql`${communityPosts.repostCount} + 1` })
    .where(eq(communityPosts.id, postId));
  return getPublicPost(doc!.id, viewerId);
}
