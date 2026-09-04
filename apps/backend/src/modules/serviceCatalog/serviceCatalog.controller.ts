/**
 * Service Catalog HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import * as service from './serviceCatalog.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** GET /service-categories */
export async function listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await service.listCategories();
    ok(req, res, 200, { categories });
  } catch (err) {
    next(err);
  }
}

/** GET /services?categoryId=&q= */
export async function listServices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { categoryId, q } = req.query as { categoryId?: string; q?: string };
    const services = await service.listServices({ categoryId, q });
    ok(req, res, 200, { services });
  } catch (err) {
    next(err);
  }
}
