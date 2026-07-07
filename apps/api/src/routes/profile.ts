import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { withTenant } from '@pixsignpro/db';
import { requireAuth } from '../middleware/auth';
import { uploadProfile } from '../middleware/upload';
import { deleteFile } from '../lib/storage';
import { config } from '../config';
import { ok, err } from '../lib/response';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const PROFILE_FILE_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i;
const PROFILE_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

// GET /api/profile/file/:filename — serve the caller's own profile pic / company
// logo. Tenant-scoped by the JWT (businessId never comes from the URL), so one
// user can never read another business's files. Auth is enforced by the
// router-level requireAuth above; AuthImg on the client sends the Bearer token.
profileRouter.get('/file/:filename', (req, res) => {
  const { filename } = req.params;
  if (!PROFILE_FILE_RE.test(filename)) { res.status(404).end(); return; }

  const baseDir = path.resolve(config.storageDir, req.user!.businessId);
  const absPath = path.resolve(baseDir, filename);
  if (absPath !== baseDir && !absPath.startsWith(baseDir + path.sep)) {
    res.status(404).end(); return; // path traversal guard
  }
  if (!fs.existsSync(absPath)) { res.status(404).end(); return; }

  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', PROFILE_EXT_MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3000');
  fs.createReadStream(absPath).pipe(res);
});

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
    const url = `/api/profile/file/${req.file.filename}`;

    // Delete old profile pic if exists (take the filename from any URL format).
    const old = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({ where: { id: req.user!.userId }, select: { profilePicUrl: true } }),
    );
    if (old?.profilePicUrl) {
      const oldName = old.profilePicUrl.split('/').pop();
      if (oldName) deleteFile(path.join(config.storageDir, req.user!.businessId, oldName));
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
    const url = `/api/profile/file/${req.file.filename}`;

    const old = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({ where: { id: req.user!.userId }, select: { companyLogoUrl: true } }),
    );
    if (old?.companyLogoUrl) {
      const oldName = old.companyLogoUrl.split('/').pop();
      if (oldName) deleteFile(path.join(config.storageDir, req.user!.businessId, oldName));
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
