/**
 * Service Catalog router — mounted at `/` from v1.ts (see the two
 * distinct top-level paths below).
 *
 *   GET  /service-categories        the 24 top-level categories
 *   GET  /services?categoryId=&q=   services within a category, or search
 *
 * Both roles read this — it's the one shared catalog Quick Work,
 * Scheduled Work, and worker service-eligibility all consume (see
 * db/schema/catalog.ts). No role restriction; `requireAuth` only.
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './serviceCatalog.controller';
import { listServicesSchema } from './serviceCatalog.schemas';

export const serviceCategoriesRouter = Router();
serviceCategoriesRouter.get('/', requireAuth, controller.listCategories);

export const servicesRouter = Router();
servicesRouter.get('/', requireAuth, validate(listServicesSchema), controller.listServices);
