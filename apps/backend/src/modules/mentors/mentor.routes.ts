/**
 * /mentors router. Mounted at /api/v1/mentors.
 *
 *   GET    /mentors?trade=&city=    — discover mentors
 *   POST   /mentors                 — become a mentor (self)
 *   DELETE /mentors                 — stop being a mentor (self)
 *   POST   /mentors/:userId/request — mentee → mentor request
 *   PATCH  /mentors/requests/:id    — mentor accepts/declines/ends
 *   GET    /mentors/requests/mine   — both sides of the current user
 *
 * Bookable sessions:
 *   POST   /mentors/slots                  — mentor publishes slots
 *   GET    /mentors/:userId/slots          — a mentor's open upcoming slots
 *   GET    /mentors/sessions/mine          — my sessions (both sides)
 *   POST   /mentors/sessions/:id/book      — mentee books a slot
 *   POST   /mentors/sessions/:id/cancel    — either side
 *   POST   /mentors/sessions/:id/paid      — mentee "I paid" / mentor "received"
 *   POST   /mentors/sessions/:id/complete  — mentor marks done
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import * as service from './mentor.service';
import * as sessions from './mentorSession.service';
import { z } from 'zod';
import { validate } from '@/middleware/validate';
import { SESSION_MODES } from './mentorSession.model';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const trade = String(req.query.trade ?? '').trim().toLowerCase();
    const city = String(req.query.city ?? '').trim();
    if (!trade || !city) {
      res.status(400).json({ error: 'trade and city are required' });
      return;
    }
    const mentors = await service.listForTrade(trade, city);
    res.json({ mentors });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { trade?: string; city?: string; bio?: string };
    if (!body.trade || !body.city) {
      res.status(400).json({ error: 'trade and city are required' });
      return;
    }
    const mentor = await service.becomeMentor({
      userId: req.user!.id,
      trade: body.trade,
      city: body.city,
      bio: body.bio,
    });
    res.json({ mentor });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    await service.stopBeingMentor(req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:userId/request',
  requireAuth,
  requireRole('seeker'),
  async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { message?: string };
      const r = await service.requestMentorship({
        menteeId: req.user!.id,
        mentorUserId: req.params.userId!,
        message: (body.message ?? '').slice(0, 400),
      });
      res.json({ request: r });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/requests/:id', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      decision?: 'accepted' | 'declined' | 'ended';
    };
    if (!body.decision) {
      res.status(400).json({ error: 'decision is required' });
      return;
    }
    const r = await service.respondToRequest({
      requestId: req.params.id!,
      responderId: req.user!.id,
      decision: body.decision,
    });
    res.json({ request: r });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/mine', requireAuth, async (req, res, next) => {
  try {
    const both = await service.listMyRequests(req.user!.id);
    res.json(both);
  } catch (err) {
    next(err);
  }
});

// ─── Bookable sessions ───────────────────────────────────────────────────
const slotSchema = z.object({
  body: z.object({
    slots: z
      .array(
        z.object({
          startAt: z.string().datetime(),
          durationMinutes: z.number().int().min(15).max(120),
          priceRupees: z.number().min(0).max(5000),
          mode: z.enum(SESSION_MODES).optional(),
          topic: z.string().max(120).nullish(),
        }),
      )
      .min(1)
      .max(14),
  }),
});

router.post('/slots', requireAuth, requireRole('seeker'), validate(slotSchema), async (req, res, next) => {
  try {
    const created = await sessions.createSlots(req.user!.id, req.body.slots);
    res.json({ ok: true, data: { sessions: created }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/mine', requireAuth, async (req, res, next) => {
  try {
    const both = await sessions.listMine(req.user!.id);
    res.json({ ok: true, data: both, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get('/:userId/slots', requireAuth, async (req, res, next) => {
  try {
    const slots = await sessions.listOpenSlots(req.params.userId!);
    res.json({ ok: true, data: { sessions: slots }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

const sid = z.object({ params: z.object({ id: z.string().min(1) }) });
router.post(
  '/sessions/:id/book',
  requireAuth,
  requireRole('seeker'),
  validate(sid.extend({ body: z.object({ note: z.string().max(400).nullish() }) })),
  async (req, res, next) => {
    try {
      const session = await sessions.book(req.user!.id, req.params.id!, req.body.note);
      res.json({ ok: true, data: { session }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
for (const [path, fn] of [
  ['cancel', sessions.cancel],
  ['paid', sessions.markPaid],
  ['complete', sessions.complete],
] as const) {
  router.post(`/sessions/:id/${path}`, requireAuth, validate(sid), async (req, res, next) => {
    try {
      const session = await fn(req.user!.id, req.params.id!);
      res.json({ ok: true, data: { session }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  });
}

export default router;
