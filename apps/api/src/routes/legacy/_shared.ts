// Shared helpers for the legacy Flutter-app compatibility layer (/pro/api/*.php).
//
// Auth model: Bearer JWT access token on every authenticated request.
// The server derives userId / businessId / role from the token; client-sent ids are ignored.
// Refresh tokens are opaque random strings stored as SHA-256 hashes in mobile_refresh_tokens.
// Media URLs are HMAC-SHA256 signed with a 1-hour expiry.

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { withSystem, withTenant } from '@pixsignpro/db';
import { config } from '../../config';

// --- Mobile JWT payload (inside access token) ----------------------------

export interface MobileUser {
  userId: string;
  businessId: string;
  role: string;
  legacyUserId: number;
  legacyBusinessId: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      mobileUser?: MobileUser;
    }
  }
}

// --- Envelope -------------------------------------------------------------

export function envelope(
  res: Response,
  statusCode: number,
  status: 'success' | 'error',
  message: string,
  extra: Record<string, unknown> = {},
): void {
  // Always HTTP 200 (PHP-style); real status lives in the body.
  res.status(200).json({ status_code: statusCode, Status: status, message, ...extra });
}

// --- Bearer auth middleware -----------------------------------------------

export function requireMobileAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = String(req.headers['authorization'] ?? '');
  if (!auth.startsWith('Bearer ')) {
    envelope(res, 401, 'error', 'Authentication required');
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.mobileJwt.accessSecret) as MobileUser;
    req.mobileUser = payload;
    next();
  } catch {
    envelope(res, 401, 'error', 'Token expired or invalid');
  }
}

// --- Signed media URLs ---------------------------------------------------

/** Sign a `/uploads/<businessId>/<filename>` URL valid for 1 hour. */
export function signedMediaUrl(businessId: string, filename: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = crypto
    .createHmac('sha256', config.mediaSignSecret)
    .update(`${businessId}/${filename}/${exp}`)
    .digest('hex');
  return `${config.publicBaseUrl}/uploads/${businessId}/${filename}?exp=${exp}&sig=${sig}`;
}

/** Convert a stored `/storage/<businessId>/<file>` path to a signed public URL. */
export function signedStoredPath(businessId: string, filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const s = String(filePath).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) {
    // Already a full URL (uploaded in earlier session) — re-sign using extracted parts.
    const m = s.match(/\/uploads\/([^/]+)\/([^/?]+)/);
    if (m?.[1] && m?.[2]) return signedMediaUrl(m[1], m[2]);
    return s; // fallback: return as-is
  }
  // Stored form: /storage/<businessId>/<filename>
  const filename = s.split('/').pop();
  if (!filename) return null;
  return signedMediaUrl(businessId, filename);
}

// --- Int <-> UUID resolution ---------------------------------------------

export interface ResolvedBusiness {
  id: string;
  legacyId: number;
  name: string;
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionEnd: Date | null;
}

const BUSINESS_SELECT = {
  id: true, legacyId: true, name: true,
  isActive: true, subscriptionStatus: true, subscriptionEnd: true,
} as const;

/** Resolve a business by its integer legacy id (cross-tenant lookup). */
export async function resolveBusiness(legacyId: number): Promise<ResolvedBusiness | null> {
  if (!Number.isInteger(legacyId) || legacyId <= 0) return null;
  const biz = await withSystem((tx) =>
    tx.business.findUnique({ where: { legacyId }, select: BUSINESS_SELECT }),
  );
  return biz as ResolvedBusiness | null;
}

/** Resolve a business by its UUID (for authenticated routes where token has the UUID). */
export async function resolveBusinessByUuid(businessUuid: string): Promise<ResolvedBusiness | null> {
  const biz = await withSystem((tx) =>
    tx.business.findUnique({ where: { id: businessUuid }, select: BUSINESS_SELECT }),
  );
  return biz as ResolvedBusiness | null;
}

/** Resolve a user by int legacy id, verifying it belongs to the given business. */
export async function resolveUser(businessUuid: string, legacyUserId: number) {
  if (!Number.isInteger(legacyUserId) || legacyUserId <= 0) return null;
  return withTenant(businessUuid, (tx) =>
    tx.user.findFirst({ where: { legacyId: legacyUserId, businessId: businessUuid } }),
  );
}

/** Resolve a media row by int legacy id within a business. */
export async function resolveMedia(businessUuid: string, legacyMediaId: number) {
  if (!Number.isInteger(legacyMediaId) || legacyMediaId <= 0) return null;
  return withTenant(businessUuid, (tx) =>
    tx.media.findFirst({ where: { legacyId: legacyMediaId, businessId: businessUuid } }),
  );
}

// --- Mapping to the app's JSON shapes ------------------------------------

export function roleToApp(role: string): string {
  return role === 'staff' ? 'staff' : 'bizadmin';
}

interface UserRow {
  legacyId: number; name: string; mobileNo: string; role: string;
  agencyName: string | null; city: string | null;
  profilePicUrl: string | null; companyLogoUrl: string | null;
  youtube: string | null; website: string | null; instagram: string | null;
  optional1: string | null; optional2: string | null;
  shareMessage?: string | null;
  expiresAt?: Date | null;
  isActive: boolean; createdAt: Date; updatedAt: Date;
}

export function toAppUserDetails(user: UserRow, business: ResolvedBusiness): Record<string, unknown> {
  const now = new Date();
  const businessActive =
    business.isActive &&
    business.subscriptionStatus === 'active' &&
    (!business.subscriptionEnd || business.subscriptionEnd >= now);
  const userExpired = !!user.expiresAt && user.expiresAt < now;
  const status = user.isActive && businessActive && !userExpired ? 'active' : 'inactive';

  // Show the user's own expiry when set, otherwise fall back to the business's.
  const expiry = user.expiresAt ?? business.subscriptionEnd;

  return {
    id: user.legacyId,
    business_id: business.legacyId,
    name: user.name,
    mobile: user.mobileNo,
    agency_name: user.agencyName,
    city: user.city,
    role: roleToApp(user.role),
    expiry_date: expiry ? expiry.toISOString() : null,
    status,
    profile_pic: signedStoredPath(business.id, user.profilePicUrl),
    logo: signedStoredPath(business.id, user.companyLogoUrl),
    youtube: user.youtube,
    website: user.website,
    instagram: user.instagram,
    optional_field_1: user.optional1,
    optional_field_2: user.optional2,
    share_message: user.shareMessage ?? null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

interface MediaRow {
  legacyId: number; type: string; fileName: string; createdAt: Date;
  caption?: string | null;
}

/** Build one media item in the app's shape (view-images / view-videos). */
export function toAppMedia(media: MediaRow, businessId: string): Record<string, unknown> {
  const url = signedMediaUrl(businessId, media.fileName);
  const isImage = media.type === 'image';
  return {
    id: media.legacyId,
    image_url: isImage ? url : null,
    video_url: isImage ? null : url,
    width: null,
    height: null,
    thumbnail_url: null,
    // Per-item caption the app attaches when sharing (null → app falls back to the profile share_message).
    share_message: media.caption ?? null,
    created_at: media.createdAt.toISOString(),
  };
}
