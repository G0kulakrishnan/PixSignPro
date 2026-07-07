// Legacy Flutter-app compatibility layer. Mounted at /pro/api.
// Serves the PHP-era contract the mobile app expects (see MOBILE_API_PLAN.md).
//
// Auth: Bearer JWT access token on every authenticated request (login/refresh/register are public).
// Identity is always derived from the verified token — client-sent business_id/user_id are ignored.
// All DB work runs through withTenant() so Postgres RLS applies.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { withSystem, withTenant } from '@pixsignpro/db';
import { config } from '../../config';
import { generateAutoTitle } from '../../lib/autoName';
import { checkMediaCountLimit } from '../../lib/planLimits';
import { notifyBusinessNewMedia } from '../../lib/notify';
import { deleteFile } from '../../lib/storage';
import {
  envelope, requireMobileAuth,
  resolveBusiness, resolveBusinessByUuid, resolveUser, resolveMedia,
  toAppUserDetails, toAppMedia, type ResolvedBusiness,
} from './_shared';
import { legacyUpload, finalizeFile, cleanupTmp } from './upload';

export const legacyRouter = Router();

// Rate limiter for login — tighter than the global API limiter.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    envelope(res as any, 429, 'error', 'Too many login attempts. Try again in 15 minutes.');
  },
});

const DUMMY_HASH = '$2a$12$invalidhashfortimingatk0000000000000000000000000000';

// Build a ResolvedBusiness from a full business row (used after a full include).
function toResolvedBusiness(b: {
  id: string; legacyId: number; name: string; isActive: boolean;
  subscriptionStatus: string; subscriptionEnd: Date | null;
}): ResolvedBusiness {
  return {
    id: b.id, legacyId: b.legacyId, name: b.name, isActive: b.isActive,
    subscriptionStatus: b.subscriptionStatus, subscriptionEnd: b.subscriptionEnd,
  };
}

// Issue an opaque refresh token: store SHA-256 hash in DB, return raw hex to caller.
async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + config.mobileJwt.refreshTtlMs);
  await withSystem((tx) =>
    tx.mobileRefreshToken.create({ data: { userId, tokenHash, expiresAt } }),
  );
  return raw;
}

// Issue a short-lived JWT access token from a user row + business.
function issueAccessToken(user: {
  id: string; businessId: string; role: string; legacyId: number;
}, business: { legacyId: number }): string {
  return jwt.sign(
    {
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
      legacyUserId: user.legacyId,
      legacyBusinessId: business.legacyId,
    },
    config.mobileJwt.accessSecret,
    { expiresIn: config.mobileJwt.accessTtl as jwt.SignOptions['expiresIn'] },
  );
}

// Revoke all active refresh tokens for a user (logout, password change, account delete).
async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await withSystem((tx) =>
    tx.mobileRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
}

// ============================================================
// --- 1. POST /login.php  (public, rate-limited) ------------
// ============================================================
legacyRouter.post('/login.php', loginLimiter, legacyUpload.none(), async (req, res) => {
  const username = String(req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');

  if (!username || !password) {
    envelope(res, 400, 'error', 'Mobile number and password are required');
    return;
  }

  try {
    const user = await withSystem((tx) =>
      tx.user.findUnique({ where: { mobileNo: username }, include: { business: true } }),
    );
    const match = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !match) {
      envelope(res, 401, 'error', 'Invalid mobile number or password');
      return;
    }

    if (!user.isActive) {
      envelope(res, 403, 'error', 'Your account has been disabled');
      return;
    }

    // Per-user expiry lock — an expired user cannot log in.
    if (user.expiresAt && user.expiresAt < new Date()) {
      envelope(res, 403, 'error', 'Your account has expired. Please contact support.');
      return;
    }

    const business = toResolvedBusiness(user.business);

    await withTenant(user.businessId, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastAppOpenedAt: new Date() } }),
    );

    const accessToken = issueAccessToken(user, business);
    const refreshToken = await issueRefreshToken(user.id);

    envelope(res, 200, 'success', 'Login successful', {
      access_token: accessToken,
      refresh_token: refreshToken,
      user_details: toAppUserDetails(user, business),
    });
  } catch (e) {
    console.error('[legacy/login]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 2. POST /refresh.php  (public) ------------------------
// ============================================================
legacyRouter.post('/refresh.php', legacyUpload.none(), async (req, res) => {
  const rawToken = String(req.body.refresh_token ?? '').trim();
  if (!rawToken) {
    envelope(res, 401, 'error', 'refresh_token is required');
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const stored = await withSystem((tx) =>
      tx.mobileRefreshToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { business: true } } },
      }),
    );

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      envelope(res, 401, 'error', 'Invalid or expired refresh token');
      return;
    }

    const { user } = stored;
    if (!user.isActive) {
      envelope(res, 401, 'error', 'Account is disabled');
      return;
    }

    // Rotate: revoke old token, issue new pair.
    await withSystem((tx) =>
      tx.mobileRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
    );

    const business = toResolvedBusiness(user.business);
    const accessToken = issueAccessToken(user, business);
    const newRefreshToken = await issueRefreshToken(user.id);

    envelope(res, 200, 'success', 'Token refreshed', {
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (e) {
    console.error('[legacy/refresh]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 3. POST /logout.php  (authenticated) ------------------
// ============================================================
legacyRouter.post('/logout.php', requireMobileAuth, async (req, res) => {
  try {
    await revokeAllRefreshTokens(req.mobileUser!.userId);
    envelope(res, 200, 'success', 'Logged out successfully');
  } catch (e) {
    console.error('[legacy/logout]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 4. POST /register.php  (public) -----------------------
// ============================================================
legacyRouter.post('/register.php', legacyUpload.none(), async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const mobile = String(req.body.mobile ?? '').trim();
  const password = String(req.body.password ?? '');
  const businessLegacyId = Number(req.body.business_id);

  if (!name || !mobile || password.length < 6) {
    envelope(res, 400, 'error', 'Name, mobile and password (min 6 chars) are required');
    return;
  }

  try {
    const business = await resolveBusiness(businessLegacyId);
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }

    const existing = await withSystem((tx) =>
      tx.user.findUnique({ where: { mobileNo: mobile }, select: { id: true } }),
    );
    if (existing) { envelope(res, 409, 'error', 'Mobile number already in use'); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    await withTenant(business.id, (tx) =>
      tx.user.create({
        data: { businessId: business.id, mobileNo: mobile, passwordHash, name, role: 'staff', isActive: true },
      }),
    );

    envelope(res, 201, 'success', 'Registered successfully');
  } catch (e: any) {
    if (e?.code === 'P2002') { envelope(res, 409, 'error', 'Mobile number already in use'); return; }
    console.error('[legacy/register]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 5. GET /user_profile.php  (authenticated) -------------
// ============================================================
legacyRouter.get('/user_profile.php', requireMobileAuth, async (req, res) => {
  try {
    const mu = req.mobileUser!;
    const [user, business] = await Promise.all([
      withTenant(mu.businessId, (tx) => tx.user.findUnique({ where: { id: mu.userId } })),
      resolveBusinessByUuid(mu.businessId),
    ]);
    if (!user || !business) { envelope(res, 404, 'error', 'User not found'); return; }

    envelope(res, 200, 'success', 'Profile fetched', {
      user_details: toAppUserDetails(user, business),
    });
  } catch (e) {
    console.error('[legacy/user_profile]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 6. POST /delete-user.php  (authenticated) -------------
// ============================================================
legacyRouter.post('/delete-user.php', requireMobileAuth, async (req, res) => {
  try {
    const mu = req.mobileUser!;
    const user = await withTenant(mu.businessId, (tx) =>
      tx.user.findUnique({ where: { id: mu.userId } }),
    );
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    await revokeAllRefreshTokens(mu.userId);
    await withTenant(mu.businessId, (tx) =>
      tx.user.update({ where: { id: mu.userId }, data: { isActive: false } }),
    );

    envelope(res, 200, 'success', 'Account deleted', {
      data: { id: user.legacyId, name: user.name, mobile: user.mobileNo },
    });
  } catch (e) {
    console.error('[legacy/delete-user]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 7. POST /update-profile.php  (authenticated) ----------
// ============================================================
const profileFields = legacyUpload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]);

legacyRouter.post('/update-profile.php', requireMobileAuth, profileFields, async (req, res) => {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const pic = files['profile_pic']?.[0];
  const logo = files['logo']?.[0];

  try {
    const mu = req.mobileUser!;
    const [user, business] = await Promise.all([
      withTenant(mu.businessId, (tx) => tx.user.findUnique({ where: { id: mu.userId } })),
      resolveBusinessByUuid(mu.businessId),
    ]);
    if (!user || !business) {
      cleanupTmp(pic?.path); cleanupTmp(logo?.path);
      envelope(res, 404, 'error', 'User not found'); return;
    }

    const data: any = {};
    const b = req.body;
    if (b.name !== undefined) data.name = String(b.name);
    if (b.mobile !== undefined) data.mobileNo = String(b.mobile).trim();
    if (b.agency_name !== undefined) data.agencyName = String(b.agency_name);
    if (b.city !== undefined) data.city = String(b.city);
    if (b.youtube !== undefined) data.youtube = String(b.youtube);
    if (b.website !== undefined) data.website = String(b.website);
    if (b.instagram !== undefined) data.instagram = String(b.instagram);
    if (b.optional_field_1 !== undefined) data.optional1 = String(b.optional_field_1);
    if (b.optional_field_2 !== undefined) data.optional2 = String(b.optional_field_2);
    if (b.share_message !== undefined) data.shareMessage = String(b.share_message);

    if (pic) {
      data.profilePicUrl = finalizeFile(pic.path, mu.businessId, pic.originalname);
      if (user.profilePicUrl) deleteFile(path.join(config.storageDir, '..', user.profilePicUrl));
    }
    if (logo) {
      data.companyLogoUrl = finalizeFile(logo.path, mu.businessId, logo.originalname);
      if (user.companyLogoUrl) deleteFile(path.join(config.storageDir, '..', user.companyLogoUrl));
    }

    const updated = await withTenant(mu.businessId, (tx) =>
      tx.user.update({ where: { id: mu.userId }, data }),
    );

    envelope(res, 200, 'success', 'Profile updated', {
      data: toAppUserDetails(updated, business),
    });
  } catch (e: any) {
    cleanupTmp(pic?.path); cleanupTmp(logo?.path);
    if (e?.code === 'P2002') { envelope(res, 409, 'error', 'Mobile number already in use'); return; }
    console.error('[legacy/update-profile]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 8. POST /update-password.php  (authenticated) ---------
// ============================================================
legacyRouter.post('/update-password.php', requireMobileAuth, legacyUpload.none(), async (req, res) => {
  const oldPassword = String(req.body.old_password ?? '');
  const newPassword = String(req.body.new_password ?? '');

  if (!oldPassword || newPassword.length < 6) {
    envelope(res, 400, 'error', 'Old and new password (min 6 chars) are required');
    return;
  }

  try {
    const mu = req.mobileUser!;
    const user = await withTenant(mu.businessId, (tx) =>
      tx.user.findUnique({ where: { id: mu.userId } }),
    );
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) { envelope(res, 401, 'error', 'Current password is incorrect'); return; }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await Promise.all([
      withTenant(mu.businessId, (tx) =>
        tx.user.update({ where: { id: mu.userId }, data: { passwordHash } }),
      ),
      revokeAllRefreshTokens(mu.userId), // force re-login on all devices
    ]);

    envelope(res, 200, 'success', 'Password updated successfully');
  } catch (e) {
    console.error('[legacy/update-password]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 9 & 10. GET /view-images.php, /view-videos.php --------
// ============================================================
async function listMedia(req: any, res: any, type: 'image' | 'video') {
  try {
    const mu = req.mobileUser!;
    const now = new Date();
    const items = await withTenant(mu.businessId, (tx) =>
      tx.media.findMany({
        where: {
          businessId: mu.businessId,
          type,
          OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }, { published: true }],
        },
        orderBy: { createdAt: 'desc' },
        select: { legacyId: true, type: true, fileName: true, caption: true, createdAt: true },
      }),
    );

    envelope(res, 200, 'success', 'OK', { data: items.map((m) => toAppMedia(m, mu.businessId)) });
  } catch (e) {
    console.error(`[legacy/view-${type}s]`, e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
}

legacyRouter.get('/view-images.php', requireMobileAuth, (req, res) => listMedia(req, res, 'image'));
legacyRouter.get('/view-videos.php', requireMobileAuth, (req, res) => listMedia(req, res, 'video'));

// ============================================================
// --- 11 & 12. POST /upload-image.php, /upload-video.php ----
// ============================================================
async function enforceStorage(businessUuid: string, addBytes: number): Promise<boolean> {
  const [used, biz] = await Promise.all([
    withTenant(businessUuid, (tx) =>
      tx.media.aggregate({ _sum: { fileSize: true }, where: { businessId: businessUuid } }),
    ),
    withSystem((tx) =>
      tx.business.findUnique({ where: { id: businessUuid }, include: { plan: true } }),
    ),
  ]);
  const usedBytes = Number(used._sum.fileSize ?? 0);
  const maxMb = biz?.plan?.maxStorageMb ?? 0;
  if (maxMb <= 0) return true;
  return usedBytes + addBytes <= maxMb * 1024 * 1024;
}

function makeUploadHandler(type: 'image' | 'video', field: 'image' | 'video') {
  return async (req: any, res: any) => {
    const file = req.file as Express.Multer.File | undefined;
    try {
      const mu = req.mobileUser!;
      if (!file) { envelope(res, 400, 'error', `No ${field} uploaded`); return; }

      // Enforce plan media-count limit (images/videos).
      const countCheck = await checkMediaCountLimit(
        mu.businessId,
        type === 'image' ? 1 : 0,
        type === 'video' ? 1 : 0,
      );
      if (!countCheck.ok) {
        cleanupTmp(file.path);
        envelope(res, 403, 'error', countCheck.message ?? 'Plan media limit reached');
        return;
      }

      if (!(await enforceStorage(mu.businessId, file.size))) {
        cleanupTmp(file.path);
        envelope(res, 403, 'error', 'Storage limit reached for your plan');
        return;
      }

      const filePath = finalizeFile(file.path, mu.businessId, file.originalname);
      const title = await generateAutoTitle(mu.businessId);
      const rawCaption = req.body?.caption;
      const caption = typeof rawCaption === 'string' && rawCaption.trim() ? rawCaption.trim() : null;

      await withTenant(mu.businessId, (tx) =>
        tx.media.create({
          data: {
            businessId: mu.businessId, type, title, caption,
            fileName: path.basename(filePath), filePath,
            fileSize: file.size, mimeType: file.mimetype,
            uploadedById: mu.userId,
            published: true,
          },
        }),
      );

      envelope(res, 200, 'success', `${type === 'image' ? 'Image' : 'Video'} uploaded`);

      // Legacy uploads publish immediately — notify the business's devices.
      // Fire-and-forget: a push failure must not affect the upload response.
      void notifyBusinessNewMedia(mu.businessId, [{ type, title }]);
    } catch (e) {
      cleanupTmp(file?.path);
      console.error(`[legacy/upload-${type}]`, e);
      envelope(res, 500, 'error', 'Unexpected error');
    }
  };
}

legacyRouter.post(
  '/upload-image.php',
  requireMobileAuth,
  legacyUpload.single('image'),
  makeUploadHandler('image', 'image'),
);
legacyRouter.post(
  '/upload-video.php',
  requireMobileAuth,
  legacyUpload.single('video'),
  makeUploadHandler('video', 'video'),
);

// ============================================================
// --- 13. POST /analytics.php  (authenticated) --------------
// ============================================================
legacyRouter.post('/analytics.php', requireMobileAuth, legacyUpload.none(), async (req, res) => {
  const type = String(req.body.type ?? '');
  const imageId = req.body.image_id != null ? Number(req.body.image_id) : null;
  const videoId = req.body.video_id != null ? Number(req.body.video_id) : null;

  try {
    const mu = req.mobileUser!;

    if (type === 'APP_OPENED') {
      // Record the app-open as an analytics event (mediaId null) AND bump the
      // user's last-opened timestamp — so we can report "opened but didn't
      // download/share" alongside per-media activity.
      await withTenant(mu.businessId, async (tx) => {
        await tx.user.update({ where: { id: mu.userId }, data: { lastAppOpenedAt: new Date() } });
        await tx.mediaEvent.create({
          data: { businessId: mu.businessId, mediaId: null, userId: mu.userId, eventType: 'app_open' },
        });
      });
    } else {
      await withTenant(mu.businessId, (tx) =>
        tx.user.update({ where: { id: mu.userId }, data: { lastAppOpenedAt: new Date() } }),
      );
      const eventType = type.endsWith('_SHARED') ? 'share' : 'download';
      const legacyMediaId = imageId ?? videoId;
      if (legacyMediaId) {
        const media = await resolveMedia(mu.businessId, legacyMediaId);
        if (media) {
          await withTenant(mu.businessId, (tx) =>
            tx.mediaEvent.create({
              data: { businessId: mu.businessId, mediaId: media.id, userId: mu.userId, eventType },
            }),
          );
        }
      }
    }

    envelope(res, 200, 'success', 'Recorded', {
      data: { id: null, user_id: mu.legacyUserId, type, image_id: imageId, video_id: videoId },
    });
  } catch (e) {
    console.error('[legacy/analytics]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// ============================================================
// --- 14. POST /user-fcm-store.php  (authenticated) ---------
// ============================================================
// Store/refresh the caller's FCM device token for push notifications.
legacyRouter.post('/user-fcm-store.php', requireMobileAuth, legacyUpload.none(), async (req, res) => {
  const token = String(req.body.token ?? '').trim();
  const deviceType = String(req.body.device_type ?? '').trim() || null;

  if (!token) { envelope(res, 400, 'error', 'token is required'); return; }

  try {
    const mu = req.mobileUser!;
    // A device token is globally unique — if it was registered under another
    // account previously, move it to this user. Use withSystem so the delete
    // reaches a row that may belong to a different tenant.
    await withSystem(async (tx) => {
      await tx.fcmToken.deleteMany({ where: { token } });
      await tx.fcmToken.create({
        data: { businessId: mu.businessId, userId: mu.userId, token, deviceType },
      });
    });
    envelope(res, 200, 'success', 'OK');
  } catch (e) {
    console.error('[legacy/user-fcm-store]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});
