/**
 * /site-briefing router. Mounted at /api/v1/site-briefing.
 *
 *   GET /site-briefing/:jobId — read the briefing (employer who owns the
 *       job, or a worker hired on it).
 *   PUT /site-briefing/:jobId — employer creates/updates it.
 *
 * Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, jobs, siteBriefings } from '@/db/schema';

const router = Router();

const uuidId = z.string().uuid('Invalid id');
const MAX_PHOTO_CHARS = 600_000;

type SiteBriefingRow = typeof siteBriefings.$inferSelect;

function toPublic(b: SiteBriefingRow | undefined) {
  if (!b) return { text: '', photoUrls: [], audioUrl: null, exists: false };
  return {
    text: b.text,
    photoUrls: [...b.photoUrls],
    audioUrl: b.audioUrl ?? null,
    exists: true,
  };
}

router.get(
  '/:jobId',
  requireAuth,
  validate(z.object({ params: z.object({ jobId: uuidId }) })),
  async (req, res, next) => {
    try {
      const jobId = req.params.jobId!;
      const userId = req.user!.id;
      const [job] = await getDb()
        .select({ employerId: jobs.employerId })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      if (!job) throw errors.jobNotFound();
      const isEmployer = job.employerId === userId;
      if (!isEmployer) {
        // A worker may read it only if they're hired on this job.
        const [hired] = await getDb()
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.jobId, jobId),
              eq(applications.seekerId, userId),
              eq(applications.status, 'hired'),
            ),
          )
          .limit(1);
        if (!hired) throw errors.forbidden();
      }
      const [briefing] = await getDb()
        .select()
        .from(siteBriefings)
        .where(eq(siteBriefings.jobId, jobId))
        .limit(1);
      res.json({ ok: true, data: toPublic(briefing), requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:jobId',
  requireAuth,
  validate(
    z.object({
      params: z.object({ jobId: uuidId }),
      body: z.object({
        text: z.string().max(1000).default(''),
        photoDataUrls: z.array(z.string().max(MAX_PHOTO_CHARS)).max(3).optional(),
        audioDataUrl: z.string().max(1_500_000).nullable().optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const jobId = req.params.jobId!;
      const [job] = await getDb()
        .select({ employerId: jobs.employerId })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      if (!job) throw errors.jobNotFound();
      if (job.employerId !== req.user!.id) throw errors.forbidden();
      const body = req.body as {
        text: string;
        photoDataUrls?: string[];
        audioDataUrl?: string | null;
      };
      const photos = (body.photoDataUrls ?? []).filter((u) => u.startsWith('data:image/'));
      const audio =
        body.audioDataUrl && body.audioDataUrl.startsWith('data:audio/') ? body.audioDataUrl : null;
      const [doc] = await getDb()
        .insert(siteBriefings)
        .values({
          jobId,
          employerId: req.user!.id,
          text: body.text.trim(),
          photoUrls: photos,
          audioUrl: audio,
        })
        .onConflictDoUpdate({
          target: siteBriefings.jobId,
          set: {
            employerId: req.user!.id,
            text: body.text.trim(),
            photoUrls: photos,
            audioUrl: audio,
            updatedAt: new Date(),
          },
        })
        .returning();
      res.json({ ok: true, data: toPublic(doc), requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
