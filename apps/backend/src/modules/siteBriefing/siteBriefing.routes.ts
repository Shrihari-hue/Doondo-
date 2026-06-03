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
import { Types } from 'mongoose';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { errors } from '@/lib/errors';
import { SiteBriefingModel, type SiteBriefing } from './siteBriefing.model';
import { JobModel } from '@/modules/jobs/job.model';
import { ApplicationModel } from '@/modules/applications/application.model';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const MAX_PHOTO_CHARS = 600_000;

function toPublic(b: (SiteBriefing & { _id?: unknown }) | null) {
  if (!b) return { text: '', photoUrls: [], audioUrl: null, exists: false };
  return {
    text: b.text ?? '',
    photoUrls: [...(b.photoUrls ?? [])],
    audioUrl: b.audioUrl ?? null,
    exists: true,
  };
}

router.get(
  '/:jobId',
  requireAuth,
  validate(z.object({ params: z.object({ jobId: objectId }) })),
  async (req, res, next) => {
    try {
      const jobId = req.params.jobId!;
      const userId = req.user!.id;
      const job = await JobModel.findById(jobId).select('employerId').lean();
      if (!job) throw errors.jobNotFound();
      const isEmployer = (job.employerId as unknown as Types.ObjectId).toString() === userId;
      if (!isEmployer) {
        // A worker may read it only if they're hired on this job.
        const hired = await ApplicationModel.exists({
          jobId: new Types.ObjectId(jobId),
          seekerId: new Types.ObjectId(userId),
          status: 'hired',
        });
        if (!hired) throw errors.forbidden();
      }
      const briefing = await SiteBriefingModel.findOne({ jobId: new Types.ObjectId(jobId) }).lean();
      res.json({ ok: true, data: toPublic(briefing as SiteBriefing | null), requestId: req.id });
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
      params: z.object({ jobId: objectId }),
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
      const job = await JobModel.findById(jobId).select('employerId').lean();
      if (!job) throw errors.jobNotFound();
      if ((job.employerId as unknown as Types.ObjectId).toString() !== req.user!.id) {
        throw errors.forbidden();
      }
      const body = req.body as {
        text: string;
        photoDataUrls?: string[];
        audioDataUrl?: string | null;
      };
      const photos = (body.photoDataUrls ?? []).filter((u) => u.startsWith('data:image/'));
      const audio =
        body.audioDataUrl && body.audioDataUrl.startsWith('data:audio/') ? body.audioDataUrl : null;
      const doc = await SiteBriefingModel.findOneAndUpdate(
        { jobId: new Types.ObjectId(jobId) },
        {
          $set: {
            employerId: new Types.ObjectId(req.user!.id),
            text: body.text.trim(),
            photoUrls: photos,
            audioUrl: audio,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      res.json({ ok: true, data: toPublic(doc as SiteBriefing | null), requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
