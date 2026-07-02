import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { BusinessRole } from '@pixsignpro/db';

export interface AccessTokenPayload {
  sub: string; // user_id
  businessId: string;
  role: BusinessRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
}
