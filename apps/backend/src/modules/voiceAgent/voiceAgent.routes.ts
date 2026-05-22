/**
 * /voice-agent router. Mounted at /api/v1/voice-agent.
 *
 *   POST /voice-agent/turn — run one conversational turn.
 *
 * The worker is authenticated (a voice apply submits a real application
 * on their behalf) and must be a seeker. The body carries either a
 * `transcript` (when the device did speech-to-text on-device) or an
 * `audioDataUrl` clip (when it didn't) — in the latter case the existing
 * transcription service turns the audio into text first, so the voice
 * agent reuses the same speech pipeline as chat voice notes.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { transcribeAudio } from '@/modules/transcription/transcription.service';
import { runVoiceTurn } from './voiceAgent.service';

const router = Router();

const turnSchema = z.object({
  body: z
    .object({
      /** Recognised speech, when the device transcribed on-device. */
      transcript: z.string().trim().max(400).optional(),
      /** A base64 audio data URL, when the device did not. ~1.4MB cap. */
      audioDataUrl: z.string().max(1_500_000).optional(),
      /** MIME type of the audio clip (defaults to audio/m4a). */
      mimeType: z.string().max(60).optional(),
      /** The worker's coordinates — drives the job search. */
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      /** Result ids from the previous turn, so "the second one" resolves. */
      contextJobIds: z.array(z.string().max(64)).max(10).default([]),
    })
    .refine((b) => (b.transcript && b.transcript.length > 0) || !!b.audioDataUrl, {
      message: 'Provide either a transcript or an audioDataUrl.',
    }),
});

router.post(
  '/turn',
  requireAuth,
  requireRole('seeker'),
  validate(turnSchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        transcript?: string;
        audioDataUrl?: string;
        mimeType?: string;
        lat: number;
        lng: number;
        contextJobIds: string[];
      };

      // Resolve the transcript: prefer the device's text; otherwise turn
      // the audio clip into text via the shared transcription service.
      let transcript = (body.transcript ?? '').trim();
      if (!transcript && body.audioDataUrl) {
        const result = await transcribeAudio({
          dataUrl: body.audioDataUrl,
          mimeType: body.mimeType ?? 'audio/m4a',
        });
        transcript = result.text.trim();
      }

      const turn = await runVoiceTurn({
        seekerId: req.user!.id,
        transcript,
        lat: body.lat,
        lng: body.lng,
        contextJobIds: body.contextJobIds,
      });

      res.json({ ok: true, data: turn, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
