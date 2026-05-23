/**
 * Community feed endpoints — typed wrappers around apiRequest.
 *
 * Backs the Community tab: a LinkedIn-style feed where workers post
 * updates, photos, videos and certificates, and like / comment / repost
 * each other's posts.
 */

import { apiRequest } from './client';

export type PostType = 'text' | 'photo' | 'video' | 'certificate';

export interface ApiAuthor {
  id: string;
  name: string;
  photoUrl: string | null;
  /** Short trade/role line. */
  headline: string | null;
}

export interface ApiReply {
  id: string;
  author: ApiAuthor;
  text: string;
  createdAt: string;
}

export interface ApiComment {
  id: string;
  author: ApiAuthor;
  text: string;
  createdAt: string;
  replies: ApiReply[];
}

export interface ApiReshared {
  author: ApiAuthor;
  type: PostType;
  text: string;
  mediaUrl: string | null;
  certificateTitle: string | null;
  createdAt: string;
}

export interface ApiPost {
  id: string;
  author: ApiAuthor;
  type: PostType;
  text: string;
  mediaUrl: string | null;
  certificateTitle: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  comments: ApiComment[];
  repostCount: number;
  reshared: ApiReshared | null;
}

export interface CreatePostParams {
  type: PostType;
  text: string;
  /** Base64 data URL for photo / video poster / certificate image. */
  mediaDataUrl?: string | null;
  certificateTitle?: string | null;
}

export const communityApi = {
  /** The Community feed — newest posts first. */
  feed: (limit?: number) =>
    apiRequest<{ posts: ApiPost[] }>(
      `/community/feed${limit ? `?limit=${limit}` : ''}`,
    ),

  /** Create a new post. */
  createPost: (p: CreatePostParams) =>
    apiRequest<{ post: ApiPost }>('/community/posts', {
      method: 'POST',
      body: {
        type: p.type,
        text: p.text,
        mediaDataUrl: p.mediaDataUrl ?? null,
        certificateTitle: p.certificateTitle ?? null,
      },
    }),

  /** Toggle the signed-in worker's like on a post. */
  like: (postId: string) =>
    apiRequest<{ post: ApiPost }>(`/community/posts/${postId}/like`, {
      method: 'POST',
    }),

  /** Add a comment to a post. */
  comment: (postId: string, text: string) =>
    apiRequest<{ post: ApiPost }>(`/community/posts/${postId}/comments`, {
      method: 'POST',
      body: { text },
    }),

  /** Reply to a comment on a post. */
  reply: (postId: string, commentId: string, text: string) =>
    apiRequest<{ post: ApiPost }>(
      `/community/posts/${postId}/comments/${commentId}/replies`,
      { method: 'POST', body: { text } },
    ),

  /** Repost a post to the signed-in worker's own feed. */
  repost: (postId: string) =>
    apiRequest<{ post: ApiPost }>(`/community/posts/${postId}/repost`, {
      method: 'POST',
    }),
};
