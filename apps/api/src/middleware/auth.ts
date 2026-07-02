import type { Request, Response, NextFunction } from 'express';
import type { BusinessRole } from '@pixsignpro/db';
import { verifyAccessToken } from '../lib/jwt';
import { err } from '../lib/response';

export interface AuthUser {
  userId: string;
  businessId: string;
  role: BusinessRole;
}

// Extends Express Request with the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the Bearer access token and attaches `req.user`.
 * businessId and role always come from the signed token — never from client input.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    err(res, 401, 'unauthorized', 'Missing or invalid Authorization header');
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    if (payload.type !== 'access') throw new Error('wrong token type');
    req.user = { userId: payload.sub, businessId: payload.businessId, role: payload.role };
    next();
  } catch {
    err(res, 401, 'unauthorized', 'Invalid or expired access token');
  }
}

/**
 * Role guard — call after requireAuth.
 * Usage: requireRole('business_admin', 'media_admin')
 */
export function requireRole(...roles: BusinessRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      err(res, 403, 'forbidden', 'Insufficient permissions');
      return;
    }
    next();
  };
}
