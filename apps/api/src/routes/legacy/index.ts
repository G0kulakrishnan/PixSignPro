// Legacy Flutter-app compatibility layer. Mounted at /pro/api.
// Serves the exact PHP-era contract the mobile app expects (see MOBILE_API_PLAN.md).
// All responses are HTTP 200 with a { status_code, Status, message, ... } body.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import { withSystem, withTenant } from '@pixsignpro/db';
import { config } from '../../config';
import { generateAutoTitle } from '../../lib/autoName';
import { deleteFile } from '../../lib/storage';
import {
  envelope, requireApiKey, resolveBusiness, resolveUser, resolveMedia,
  toAppUserDetails, toAppMedia, type ResolvedBusiness,
} from './_shared';
import { legacyUpload, finalizeFile, cleanupTmp } from './upload';

export const legacyRouter = Router();
legacyRouter.use(requireApiKey);

const DUMMY_HASH = '$2a$12$invalidhashfortimingatk0000000000000000000000000000';

// Build a ResolvedBusiness from a full business row.
function toResolvedBusiness(b: {
  id: string; legacyId: number; name: string; isActive: boolean;
  subscriptionStatus: string; subscriptionEnd: Date | null;
}): ResolvedBusiness {
  return {
    id: b.id, legacyId: b.legacyId, name: b.name, isActive: b.isActive,
    subscriptionStatus: b.subscriptionStatus, subscriptionEnd: b.subscriptionEnd,
  };
}

// --- 1. GET /login.php?username=<mobile>&password= -----------------------
legacyRouter.get('/login.php', async (req, res) => {
  const username = String(req.query.username ?? '').trim();
  const password = String(req.query.password ?? '');

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

    const business = toResolvedBusiness(user.business);

    // Track app-open activity.
    await withTenant(user.businessId, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastAppOpenedAt: new Date() } }),
    );

    envelope(res, 200, 'success', 'Login successful', {
      user_details: toAppUserDetails(user, business),
    });
  } catch (e) {
    console.error('[legacy/login]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// --- 2. GET /user_profile.php?user_id=&business_id= ----------------------
legacyRouter.get('/user_profile.php', async (req, res) => {
  try {
    const business = await resolveBusiness(Number(req.query.business_id));
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }
    const user = await resolveUser(business.id, Number(req.query.user_id));
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    envelope(res, 200, 'success', 'Profile fetched', {
      user_details: toAppUserDetails(user, business),
    });
  } catch (e) {
    console.error('[legacy/user_profile]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// --- 3. GET /delete-user.php?user_id=&business_id= (soft delete) ----------
legacyRouter.get('/delete-user.php', async (req, res) => {
  try {
    const business = await resolveBusiness(Number(req.query.business_id));
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }
    const user = await resolveUser(business.id, Number(req.query.user_id));
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    await withTenant(business.id, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { isActive: false } }),
    );

    envelope(res, 200, 'success', 'Account deleted', {
      data: { id: user.legacyId, name: user.name, mobile: user.mobileNo },
    });
  } catch (e) {
    console.error('[legacy/delete-user]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// --- 4. POST /register.php (name, mobile, password, business_id=3) --------
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

    // Globally-unique mobile check.
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

// --- 5. POST /update-profile.php (multipart, optional profile_pic + logo) -
const profileFields = legacyUpload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]);

legacyRouter.post('/update-profile.php', profileFields, async (req, res) => {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const pic = files['profile_pic']?.[0];
  const logo = files['logo']?.[0];

  try {
    const business = await resolveBusiness(Number(req.body.business_id));
    if (!business) {
      cleanupTmp(pic?.path); cleanupTmp(logo?.path);
      envelope(res, 404, 'error', 'Business not found'); return;
    }
    const user = await resolveUser(business.id, Number(req.body.user_id));
    if (!user) {
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

    if (pic) {
      data.profilePicUrl = finalizeFile(pic.path, business.id, pic.originalname);
      if (user.profilePicUrl) deleteFile(path.join(config.storageDir, '..', user.profilePicUrl));
    }
    if (logo) {
      data.companyLogoUrl = finalizeFile(logo.path, business.id, logo.originalname);
      if (user.companyLogoUrl) deleteFile(path.join(config.storageDir, '..', user.companyLogoUrl));
    }

    const updated = await withTenant(business.id, (tx) =>
      tx.user.update({ where: { id: user.id }, data }),
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

// --- 6. POST /update-password.php ----------------------------------------
legacyRouter.post('/update-password.php', legacyUpload.none(), async (req, res) => {
  const oldPassword = String(req.body.old_password ?? '');
  const newPassword = String(req.body.new_password ?? '');

  if (!oldPassword || newPassword.length < 6) {
    envelope(res, 400, 'error', 'Old and new password (min 6 chars) are required');
    return;
  }

  try {
    const business = await resolveBusiness(Number(req.body.business_id));
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }
    const user = await resolveUser(business.id, Number(req.body.user_id));
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) { envelope(res, 401, 'error', 'Current password is incorrect'); return; }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await withTenant(business.id, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { passwordHash } }),
    );

    envelope(res, 200, 'success', 'Password updated successfully');
  } catch (e) {
    console.error('[legacy/update-password]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// --- 7 & 8. GET /view-images.php , /view-videos.php ----------------------
async function listMedia(req: any, res: any, type: 'image' | 'video') {
  try {
    const business = await resolveBusiness(Number(req.query.business_id));
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }

    const now = new Date();
    const items = await withTenant(business.id, (tx) =>
      tx.media.findMany({
        where: {
          businessId: business.id,
          type,
          // Only currently-published media is exposed to the app.
          OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }, { published: true }],
        },
        orderBy: { createdAt: 'desc' },
        select: { legacyId: true, type: true, filePath: true, createdAt: true },
      }),
    );

    envelope(res, 200, 'success', 'OK', { data: items.map(toAppMedia) });
  } catch (e) {
    console.error(`[legacy/view-${type}s]`, e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
}

legacyRouter.get('/view-images.php', (req, res) => listMedia(req, res, 'image'));
legacyRouter.get('/view-videos.php', (req, res) => listMedia(req, res, 'video'));

// --- 9 & 10. POST /upload-image.php , /upload-video.php ------------------
async function enforceStorage(businessUuid: string, addBytes: number): Promise<boolean> {
  const [used, biz] = await Promise.all([
    withTenant(businessUuid, (tx) => tx.media.aggregate({ _sum: { fileSize: true }, where: { businessId: businessUuid } })),
    withSystem((tx) => tx.business.findUnique({ where: { id: businessUuid }, include: { plan: true } })),
  ]);
  const usedBytes = Number(used._sum.fileSize ?? 0);
  const maxMb = biz?.plan?.maxStorageMb ?? 0; // 0 = unlimited
  if (maxMb <= 0) return true;
  return usedBytes + addBytes <= maxMb * 1024 * 1024;
}

function makeUploadHandler(type: 'image' | 'video', field: 'image' | 'video') {
  return async (req: any, res: any) => {
    const file = req.file as Express.Multer.File | undefined;
    try {
      const business = await resolveBusiness(Number(req.body.business_id));
      if (!business) { cleanupTmp(file?.path); envelope(res, 404, 'error', 'Business not found'); return; }
      if (!file) { envelope(res, 400, 'error', `No ${field} uploaded`); return; }

      if (!(await enforceStorage(business.id, file.size))) {
        cleanupTmp(file.path);
        envelope(res, 403, 'error', 'Storage limit reached for your plan');
        return;
      }

      const filePath = finalizeFile(file.path, business.id, file.originalname);
      const title = await generateAutoTitle(business.id);

      await withTenant(business.id, (tx) =>
        tx.media.create({
          data: {
            businessId: business.id, type, title,
            fileName: path.basename(filePath), filePath,
            fileSize: file.size, mimeType: file.mimetype,
            published: true,
          },
        }),
      );

      envelope(res, 200, 'success', `${type === 'image' ? 'Image' : 'Video'} uploaded`);
    } catch (e) {
      cleanupTmp(file?.path);
      console.error(`[legacy/upload-${type}]`, e);
      envelope(res, 500, 'error', 'Unexpected error');
    }
  };
}

legacyRouter.post('/upload-image.php', legacyUpload.single('image'), makeUploadHandler('image', 'image'));
legacyRouter.post('/upload-video.php', legacyUpload.single('video'), makeUploadHandler('video', 'video'));

// --- 11. POST /analytics.php ---------------------------------------------
legacyRouter.post('/analytics.php', legacyUpload.none(), async (req, res) => {
  const type = String(req.body.type ?? '');
  const imageId = req.body.image_id != null ? Number(req.body.image_id) : null;
  const videoId = req.body.video_id != null ? Number(req.body.video_id) : null;

  try {
    const business = await resolveBusiness(Number(req.body.business_id));
    if (!business) { envelope(res, 404, 'error', 'Business not found'); return; }
    const user = await resolveUser(business.id, Number(req.body.user_id));
    if (!user) { envelope(res, 404, 'error', 'User not found'); return; }

    // Always refresh app-open activity.
    await withTenant(business.id, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastAppOpenedAt: new Date() } }),
    );

    if (type !== 'APP_OPENED') {
      const eventType = type.endsWith('_SHARED') ? 'share' : 'download';
      const legacyMediaId = imageId ?? videoId;
      if (legacyMediaId) {
        const media = await resolveMedia(business.id, legacyMediaId);
        if (media) {
          await withTenant(business.id, (tx) =>
            tx.mediaEvent.create({
              data: { businessId: business.id, mediaId: media.id, userId: user.id, eventType },
            }),
          );
        }
      }
    }

    envelope(res, 200, 'success', 'Recorded', {
      data: { id: null, user_id: user.legacyId, type, image_id: imageId, video_id: videoId },
    });
  } catch (e) {
    console.error('[legacy/analytics]', e);
    envelope(res, 500, 'error', 'Unexpected error');
  }
});

// --- 12. POST /user-fcm-store.php (stub — push not implemented in v1) -----
legacyRouter.post('/user-fcm-store.php', legacyUpload.none(), (_req, res) => {
  envelope(res, 200, 'success', 'OK');
});
