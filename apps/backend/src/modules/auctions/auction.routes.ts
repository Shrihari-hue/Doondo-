/**
 * /auctions router. Mounted at /api/v1/auctions.
 *
 * Employer:  POST /auctions {jobId, maxPaise, durationMinutes} · GET /auctions/mine
 *            GET /auctions/:id (with bids) · POST /auctions/:id/award {bidId}
 *            POST /auctions/:id/cancel
 * Seeker:    GET /auctions/nearby?lat&lng · POST /auctions/:id/bids {amountPaise, etaMinutes}
 *            DELETE /auctions/:id/bids
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as svc from './auction.service';

const router = Router();
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any, next: any) => {
  try {
    res.json({ ok: true, data: await fn(req), requestId: req.id });
  } catch (err) {
    next(err);
  }
};
const id = z.object({ params: z.object({ id: z.string().min(1) }) });

router.get('/nearby', requireAuth, requireRole('seeker'),
  validate(z.object({ query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }) })),
  wrap(async (req) => ({ auctions: await svc.listNearby(req.user.id, Number(req.query.lat), Number(req.query.lng)) })));
router.get('/mine', requireAuth, requireRole('employer'), wrap(async (req) => ({ auctions: await svc.listMineForEmployer(req.user.id) })));
router.post('/', requireAuth, requireRole('employer'),
  validate(z.object({ body: z.object({ jobId: z.string().min(1), maxPaise: z.number().int().min(100).max(10_000_000), durationMinutes: z.number().int().min(10).max(120) }) })),
  wrap(async (req) => ({ auction: await svc.startAuction(req.user.id, req.body) })));
router.get('/:id', requireAuth, requireRole('employer'), validate(id), wrap(async (req) => svc.getForEmployer(req.user.id, req.params.id)));
router.post('/:id/award', requireAuth, requireRole('employer'), validate(id.extend({ body: z.object({ bidId: z.string().min(1) }) })),
  wrap(async (req) => svc.award(req.user.id, req.params.id, req.body.bidId)));
router.post('/:id/cancel', requireAuth, requireRole('employer'), validate(id), wrap(async (req) => { await svc.cancel(req.user.id, req.params.id); return { cancelled: true }; }));
router.post('/:id/bids', requireAuth, requireRole('seeker'),
  validate(id.extend({ body: z.object({ amountPaise: z.number().int().min(100).max(10_000_000), etaMinutes: z.number().int().min(0).max(240) }) })),
  wrap(async (req) => ({ auction: await svc.placeBid(req.user.id, req.params.id, req.body) })));
router.delete('/:id/bids', requireAuth, requireRole('seeker'), validate(id), wrap(async (req) => { await svc.withdrawBid(req.user.id, req.params.id); return { withdrawn: true }; }));

export default router;
