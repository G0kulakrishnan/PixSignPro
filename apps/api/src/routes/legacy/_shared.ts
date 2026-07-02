// Shared helpers for the legacy Flutter-app compatibility layer (/pro/api/*.php).
//
// The mobile app speaks a fixed PHP-era contract we cannot change:
//  - integer ids (businesses/users/media each carry a `legacyId` surrogate),
//  - `Status` (capital S) + `status_code` envelope, always HTTP 200,
//  - no JWT — identity is the `business_id`/`user_id` in the request (old trust model).
//
// Every DB access still runs through withTenant(businessUuid, …) so Postgres RLS
// applies even here; withSystem is used only to resolve a business by its int id.

import type { Request, Response, NextFunction } from 'express';
import { withSystem, withTenant } from '@pixsignpro/db';
import { config } from '../../config';

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

// --- API key gate ---------------------------------------------------------

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = (req.query['api-key'] as string | undefined) ?? '';
  if (key !== config.legacyApiKey) {
    envelope(res, 401, 'error', 'Invalid API key');
    return;
  }
  next();
}

// --- Int <-> UUID resolution ---------------------------------------------

export interface ResolvedBusiness {
  id: string; // uuid
  legacyId: number;
  name: string;
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionEnd: Date | null;
}

/** Resolve a business by its integer legacy id. Cross-tenant → withSystem. */
export async function resolveBusiness(legacyId: number): Promise<ResolvedBusiness | null> {
  if (!Number.isInteger(legacyId) || legacyId <= 0) return null;
  const biz = await withSystem((tx) =>
    tx.business.findUnique({
      where: { legacyId },
      select: {
        id: true, legacyId: true, name: true, isActive: true,
        subscriptionStatus: true, subscriptionEnd: true,
      },
    }),
  );
  return biz as ResolvedBusiness | null;
}

/** Resolve a user by int legacy id, verifying it belongs to the given business. */
export async function resolveUser(businessUuid: string, legacyUserId: number) {
  if (!Number.isInteger(legacyUserId) || legacyUserId <= 0) return null;
  const user = await withTenant(businessUuid, (tx) =>
    tx.user.findFirst({ where: { legacyId: legacyUserId, businessId: businessUuid } }),
  );
  return user;
}

/** Resolve a media row by int legacy id within a business. */
export async function resolveMedia(businessUuid: string, legacyMediaId: number) {
  if (!Number.isInteger(legacyMediaId) || legacyMediaId <= 0) return null;
  return withTenant(businessUuid, (tx) =>
    tx.media.findFirst({ where: { legacyId: legacyMediaId, businessId: businessUuid } }),
  );
}

// --- Mapping to the app's JSON shapes ------------------------------------

/** Our role → the string the Flutter app checks (`bizadmin` unlocks upload). */
export function roleToApp(role: string): string {
  return role === 'staff' ? 'staff' : 'bizadmin';
}

/** Turn a stored `/storage/<uuid>/<file>` path into a public absolute URL. */
export function storedPathToPublicUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const s = String(filePath).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // Stored form is `/storage/<businessId>/<filename>` → public `/uploads/...`.
  const rel = s.replace(/^\/?storage\//, '');
  return `${config.publicBaseUrl}/uploads/${rel}`;
}

export function publicUrl(businessUuid: string, filename: string): string {
  return `${config.publicBaseUrl}/uploads/${businessUuid}/${filename}`;
}

interface UserRow {
  legacyId: number; name: string; mobileNo: string; role: string;
  agencyName: string | null; city: string | null;
  profilePicUrl: string | null; companyLogoUrl: string | null;
  youtube: string | null; website: string | null; instagram: string | null;
  optional1: string | null; optional2: string | null;
  isActive: boolean; createdAt: Date; updatedAt: Date;
}

/** Build the exact `user_details` object the app parses (login & user_profile). */
export function toAppUserDetails(user: UserRow, business: ResolvedBusiness): Record<string, unknown> {
  const businessActive =
    business.isActive &&
    business.subscriptionStatus === 'active' &&
    (!business.subscriptionEnd || business.subscriptionEnd >= new Date());
  const status = user.isActive && businessActive ? 'active' : 'inactive';

  return {
    id: user.legacyId,
    business_id: business.legacyId,
    name: user.name,
    mobile: user.mobileNo,
    agency_name: user.agencyName,
    city: user.city,
    role: roleToApp(user.role),
    expiry_date: business.subscriptionEnd ? business.subscriptionEnd.toISOString() : null,
    status,
    profile_pic: storedPathToPublicUrl(user.profilePicUrl),
    logo: storedPathToPublicUrl(user.companyLogoUrl),
    youtube: user.youtube,
    website: user.website,
    instagram: user.instagram,
    optional_field_1: user.optional1,
    optional_field_2: user.optional2,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

interface MediaRow {
  legacyId: number; type: string; filePath: string; createdAt: Date;
}

/** Build one media item in the app's shape (view-images / view-videos). */
export function toAppMedia(media: MediaRow): Record<string, unknown> {
  const url = storedPathToPublicUrl(media.filePath);
  const isImage = media.type === 'image';
  return {
    id: media.legacyId,
    image_url: isImage ? url : null,
    video_url: isImage ? null : url,
    width: null,
    height: null,
    thumbnail_url: null,
    created_at: media.createdAt.toISOString(),
  };
}
