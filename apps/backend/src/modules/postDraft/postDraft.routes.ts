/**
 * /post-draft router. Mounted at /api/v1/post-draft.
 *
 *   POST /post-draft/voice — turn an employer's spoken sentence into a
 *                            draft job post (does NOT publish).
 *
 * The employer is authenticated and must hold the employer role. The body
 * carries either a `transcript` (device did speech-to-text on-device) or
 * an `audioDataUrl` clip (it didn't) — in the latter case the shared
 * transcription service turns the audio into text first, so this reuses
 * the same speech pipeline as chat voice notes and the seeker voice agent.
 *
 * This endpoint only reads + parses: the returned draft is handed to
 * PostJobScreen, where the employer confirms and publishes through the
 * existing POST /jobs path. Drafting and publishing stay separate so a
 * mis-heard wage can never go live unconfirmed.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { runPostDraftTurn } from './postDraft.service';

const router = Router();

const voiceDraftSchema = z.object({
  body: z
    .object({
      /** Recognised speech, when the device transcribed on-device. */
      transcript: z.string().trim().max(400).optional(),
      /** A base64 audio data URL, when the device did not. ~1.4MB cap. */
      audioDataUrl: z.string().max(1_500_000).optional(),
      /** MIME type of the audio clip (defaults to audio/m4a). */
      mimeType: z.string().max(60).optional(),
    })
    .refine((b) => (b.transcript && b.transcript.length > 0) || !!b.audioDataUrl, {
      message: 'Provide either a transcript or an audioDataUrl.',
    }),
});

router.post(
  '/voice',
  requireAuth,
  requireRole('employer'),
  validate(voiceDraftSchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        transcript?: string;
        audioDataUrl?: string;
        mimeType?: string;
      };

      const result = await runPostDraftTurn({
        employerId: req.user!.id,
        transcript: body.transcript,
        audioDataUrl: body.audioDataUrl,
        mimeType: body.mimeType,
      });

      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
