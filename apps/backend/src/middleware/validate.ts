/**
 * validate(schema) — a Zod-backed middleware that validates body, query,
 * and/or params in one call. Replaces ad-hoc `if (!req.body.x) return 400`
 * checks scattered through controllers.
 *
 * Usage:
 *   import { z } from 'zod';
 *   const schema = z.object({ body: z.object({ email: z.string().email() }) });
 *   router.post('/login', validate(schema), controller);
 *
 * The validated, type-narrowed values are written back to req.body / .query
 * / .params so downstream code gets the parsed (and possibly transformed)
 * versions.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodSchema } from 'zod';

export const requestSchema = z.object({
  body: z.unknown().optional(),
  query: z.unknown().optional(),
  params: z.unknown().optional(),
});

export type RequestSchema = z.infer<typeof requestSchema>;

export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      next(result.error);
      return;
    }
    const data = result.data as RequestSchema;
    if (data.body !== undefined) req.body = data.body;
    if (data.query !== undefined) req.query = data.query as Request['query'];
    if (data.params !== undefined) req.params = data.params as Request['params'];
    next();
  };
}
