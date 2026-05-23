/**
 * Community post — a worker's feed post (LinkedIn-style Community tab).
 *
 * One document per post. Comments and their replies are embedded
 * subdocuments — a feed post is bounded enough that embedding keeps
 * reads to a single round-trip. Likes are a flat array of user ids so
 * a viewer's "liked by me" is a cheap membership check.
 *
 * A repost is its own Post document with `reshared` set to a frozen
 * snapshot of the original (so editing/deleting the original never
 * mutates someone else's repost).
 *
 * Media is stored as base64 data URLs on `mediaUrls` — the same
 * expedient the profile photo and reel paths use until a real object
 * store is wired up. A post can carry several images (a photo post is
 * a small gallery); other types use at most one entry.
 *
 * Post types:
 *   text        — a "Thought": plain text, no media.
 *   photo       — one or more images.
 *   video       — a video post (a still poster image for now).
 *   certificate — an achievement, with a title + optional image.
 *   resume      — the worker shares their resume.
 *   voice       — a spoken voice note.
 */

import { Schema, model, type Model } from 'mongoose';

export const POST_TYPES = [
  'text',
  'photo',
  'video',
  'certificate',
  'resume',
  'voice',
] as const;
export type PostType = (typeof POST_TYPES)[number];

/** Hard cap on a single base64 media data URL (~520 KB encoded). */
export const MAX_MEDIA_CHARS = 700_000;
/** Most media items a single post may carry. */
export const MAX_MEDIA_ITEMS = 6;

export interface PostReply {
  _id: Schema.Types.ObjectId;
  authorId: Schema.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface PostComment {
  _id: Schema.Types.ObjectId;
  authorId: Schema.Types.ObjectId;
  text: string;
  replies: PostReply[];
  createdAt: Date;
}

export interface ResharedSnapshot {
  authorId: Schema.Types.ObjectId;
  type: PostType;
  text: string;
  mediaUrls: string[];
  certificateTitle: string | null;
  createdAt: Date;
}

export interface Post {
  authorId: Schema.Types.ObjectId;
  type: PostType;
  text: string;
  mediaUrls: string[];
  certificateTitle: string | null;
  likes: Schema.Types.ObjectId[];
  comments: PostComment[];
  repostCount: number;
  reshared: ResharedSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}

const replySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const commentSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    replies: { type: [replySchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const resharedSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: POST_TYPES, required: true },
    text: { type: String, default: '', maxlength: 3000 },
    mediaUrls: { type: [String], default: [] },
    certificateTitle: { type: String, default: null, maxlength: 200 },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const postSchema = new Schema(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, enum: POST_TYPES, required: true },
    text: { type: String, default: '', trim: true, maxlength: 3000 },
    mediaUrls: { type: [String], default: [] },
    certificateTitle: { type: String, default: null, trim: true, maxlength: 200 },
    likes: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    comments: { type: [commentSchema], default: [] },
    repostCount: { type: Number, default: 0, min: 0 },
    reshared: { type: resharedSchema, default: null },
  },
  { timestamps: true },
);

// Feed query — newest posts first.
postSchema.index({ createdAt: -1 });

type PostModelType = Model<Post>;

export const PostModel = model<Post, PostModelType>('CommunityPost', postSchema);
