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
 *   Bookable 1:1 sessions — on top of an accepted request above:
 *   POST   /mentors/sessions              — mentor opens a bookable slot
 *   GET    /mentors/:userId/sessions/open — mentee views a mentor's open slots
 *   POST   /mentors/sessions/:id/book     — mentee books an open slot
 *   POST   /mentors/sessions/:id/cancel   — either side cancels
 *   GET    /mentors/sessions/mine         — both sides of my calendar
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import * as service from './mentor.service';

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

// ─── Bookable 1:1 sessions ───────────────────────────────────────────────────

router.post('/sessions', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      scheduledFor?: string;
      durationMinutes?: number;
      mode?: 'video' | 'phone' | 'in_person';
      meetingLink?: string;
      location?: string;
      notes?: string;
    };
    if (!body.scheduledFor) {
      res.status(400).json({ error: 'scheduledFor is required' });
      return;
    }
    const session = await service.openSessionSlot({
      mentorUserId: req.user!.id,
      scheduledFor: body.scheduledFor,
      durationMinutes: body.durationMinutes,
      mode: body.mode,
      meetingLink: body.meetingLink,
      location: body.location,
      notes: body.notes,
    });
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/mine', requireAuth, async (req, res, next) => {
  try {
    const both = await service.listMySessions(req.user!.id);
    res.json(both);
  } catch (err) {
    next(err);
  }
});

router.get('/:userId/sessions/open', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const slots = await service.listOpenSlots({
      menteeId: req.user!.id,
      mentorUserId: req.params.userId!,
    });
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/book', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const session = await service.bookSlot({ menteeId: req.user!.id, slotId: req.params.id! });
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const session = await service.cancelSession({ userId: req.user!.id, sessionId: req.params.id! });
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

export default router;
