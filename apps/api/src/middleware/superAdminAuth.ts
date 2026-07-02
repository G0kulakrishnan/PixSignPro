import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { err } from '../lib/response';

export interface SuperAdminUser {
  adminId: string;
  type: 'super_admin';
}

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminUser;
    }
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    err(res, 401, 'unauthorized', 'Missing or invalid Authorization header');
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwt.accessSecret) as {
      sub: string;
      type: string;
    };
    if (payload.type !== 'super_admin') throw new Error('wrong token type');
    req.superAdmin = { adminId: payload.sub, type: 'super_admin' };
    next();
  } catch {
    err(res, 401, 'unauthorized', 'Invalid or expired super admin token');
  }
}
