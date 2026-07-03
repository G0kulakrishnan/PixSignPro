import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import { z } from 'zod';
import { withTenant } from '@pixsignpro/db';
import { requireAuth } from '../middleware/auth';
import { uploadProfile } from '../middleware/upload';
import { deleteFile } from '../lib/storage';
import { ok, err } from '../lib/response';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  agencyName: z.string().optional(),
  city: z.string().optional(),
  youtube: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  optional1: z.string().optional(),
  optional2: z.string().optional(),
  shareMessage: z.string().optional(),
});

// GET /api/profile
profileRouter.get('/', async (req, res) => {
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true, name: true, mobileNo: true, role: true,
          profilePicUrl: true, companyLogoUrl: true,
          agencyName: true, city: true, youtube: true,
          website: true, instagram: true, optional1: true, optional2: true,
          shareMessage: true,
          business: { select: { name: true, website: true } },
        },
      }),
    );
    if (!user) { err(res, 404, 'not_found', 'User not found'); return; }
    ok(res, user);
  } catch (e) {
    console.error('[profile/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PUT /api/profile
profileRouter.put('/', async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({
        where: { id: req.user!.userId },
        data: parsed.data,
        select: { id: true, name: true, agencyName: true, city: true, shareMessage: true },
      }),
    );
    ok(res, user);
  } catch (e) {
    console.error('[profile/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/profile/change-password
profileRouter.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string; newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    err(res, 400, 'validation_error', 'currentPassword and newPassword (min 6 chars) required');
    return;
  }
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({ where: { id: req.user!.userId }, select: { passwordHash: true } }),
    );
    if (!user) { err(res, 404, 'not_found', 'User not found'); return; }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { err(res, 401, 'invalid_password', 'Current password is incorrect'); return; }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({ where: { id: req.user!.userId }, data: { passwordHash } }),
    );
    ok(res, { message: 'Password changed successfully' });
  } catch (e) {
    console.error('[profile/change-password]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/profile/picture — upload profile pic
profileRouter.post('/picture', uploadProfile.single('file'), async (req, res) => {
  if (!req.file) { err(res, 400, 'validation_error', 'No file uploaded'); return; }
  try {
    const url = `/storage/${req.user!.businessId}/${req.file.filename}`;

    // Delete old profile pic if exists
    const old = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({ where: { id: req.user!.userId }, select: { profilePicUrl: true } }),
    );
    if (old?.profilePicUrl) {
      deleteFile(path.join(process.cwd(), '..', '..', old.profilePicUrl.replace('/storage/', 'storage/')));
    }

    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({ where: { id: req.user!.userId }, data: { profilePicUrl: url },
        select: { id: true, profilePicUrl: true } }),
    );
    ok(res, user);
  } catch (e) {
    console.error('[profile/picture]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/profile/logo — upload company logo
profileRouter.post('/logo', uploadProfile.single('file'), async (req, res) => {
  if (!req.file) { err(res, 400, 'validation_error', 'No file uploaded'); return; }
  try {
    const url = `/storage/${req.user!.businessId}/${req.file.filename}`;

    const old = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({ where: { id: req.user!.userId }, select: { companyLogoUrl: true } }),
    );
    if (old?.companyLogoUrl) {
      deleteFile(path.join(process.cwd(), '..', '..', old.companyLogoUrl.replace('/storage/', 'storage/')));
    }

    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({ where: { id: req.user!.userId }, data: { companyLogoUrl: url },
        select: { id: true, companyLogoUrl: true } }),
    );
    ok(res, user);
  } catch (e) {
    console.error('[profile/logo]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});
