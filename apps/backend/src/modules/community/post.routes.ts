/**
 * /community router. Mounted at /api/v1/community — the Community feed.
 *
 *   GET    /community/feed                                  read the feed
 *   POST   /community/posts                                 create a post
 *   POST   /community/posts/:id/like                        toggle a like
 *   POST   /community/posts/:id/comments                    add a comment
 *   POST   /community/posts/:id/comments/:commentId/replies add a reply
 *   POST   /community/posts/:id/repost                      repost to your feed
 *
 * Every mutation responds with the updated (or new) hydrated post so the
 * client can patch its feed without a refetch.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as postService from './post.service';
import type { PostType } from './post.service';

/** Hard cap on a single base64 media data URL (~520 KB encoded). */
const MAX_MEDIA_CHARS = 700_000;
/** Most media items a single post may carry. */
const MAX_MEDIA_ITEMS = 6;

const router = Router();

const objectId = z.string().uuid('Invalid id');

// ─── read the feed ───────────────────────────────────────────────────────────

router.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const posts = await postService.listFeed(req.user!.id, limit);
    res.json({ ok: true, data: { posts }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── create a post ───────────────────────────────────────────────────────────

const createSchema = z.object({
  body: z.object({
    type: z.enum(['text', 'photo', 'video', 'certificate', 'resume', 'voice']),
    text: z.string().trim().max(3000).default(''),
    /** Base64 data URLs — photos, a video poster, a certificate or resume image. */
    mediaDataUrls: z
      .array(z.string().min(1).max(MAX_MEDIA_CHARS))
      .max(MAX_MEDIA_ITEMS)
      .optional()
      .default([]),
    certificateTitle: z.string().trim().max(200).nullable().optional(),
  }),
});

router.post('/posts', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const body = req.body as {
      type: PostType;
      text: string;
      mediaDataUrls?: string[];
      certificateTitle?: string | null;
    };
    const post = await postService.createPost({
      authorId: req.user!.id,
      type: body.type,
      text: body.text,
      mediaDataUrls: body.mediaDataUrls ?? [],
      certificateTitle: body.certificateTitle ?? null,
    });
    res.status(201).json({ ok: true, data: { post }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── like ────────────────────────────────────────────────────────────────────

router.post(
  '/posts/:id/like',
  requireAuth,
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      const post = await postService.toggleLike(req.params.id!, req.user!.id);
      res.json({ ok: true, data: { post }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── comment ─────────────────────────────────────────────────────────────────

router.post(
  '/posts/:id/comments',
  requireAuth,
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({ text: z.string().trim().min(1).max(1000) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { text } = req.body as { text: string };
      const post = await postService.addComment(req.params.id!, req.user!.id, text);
      res.status(201).json({ ok: true, data: { post }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── reply to a comment ──────────────────────────────────────────────────────

router.post(
  '/posts/:id/comments/:commentId/replies',
  requireAuth,
  validate(
    z.object({
      params: z.object({ id: objectId, commentId: objectId }),
      body: z.object({ text: z.string().trim().min(1).max(1000) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const { text } = req.body as { text: string };
      const post = await postService.addReply(
        req.params.id!,
        req.params.commentId!,
        req.user!.id,
        text,
      );
      res.status(201).json({ ok: true, data: { post }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── repost ──────────────────────────────────────────────────────────────────

router.post(
  '/posts/:id/repost',
  requireAuth,
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      const post = await postService.repost(req.params.id!, req.user!.id);
      res.status(201).json({ ok: true, data: { post }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
