/**
 * Authentication middleware.
 *
 * requireAuth: asserts a valid Bearer access token; attaches req.user.
 * optionalAuth: attaches req.user if a valid token is present, but doesn't
 *   reject the request if it isn't. Useful for endpoints that return more
 *   data when signed in.
 * requireRole: requires the authenticated user to have one of the given roles.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken, type UserRole } from '@/lib/jwt';
import { errors } from '@/lib/errors';

export interface AuthedUser {
  id: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

function readBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = readBearer(req);
  if (!token) {
    next(errors.unauthorized());
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = readBearer(req);
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Silently ignore — endpoint is meant to also work unauthenticated.
  }
  next();
};

export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(errors.unauthorized());
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(errors.forbidden());
      return;
    }
    next();
  };
}
