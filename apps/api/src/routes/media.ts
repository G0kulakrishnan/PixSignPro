import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { withTenant, withSystem } from '@pixsignpro/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadMedia, ALLOWED_IMAGE_MIMES } from '../middleware/upload';
import { deleteFile } from '../lib/storage';
import { generateAutoTitle } from '../lib/autoName';
import { ok, err } from '../lib/response';
import { config } from '../config';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

// --- Helpers ---

function isVisible(media: { scheduledPublishAt: Date | null; published: boolean }, role: string): boolean {
  if (role === 'staff') {
    // Staff can only see published or immediately-available media
    if (!media.published && media.scheduledPublishAt && media.scheduledPublishAt > new Date()) {
      return false;
    }
  }
  return true;
}

// --- Routes ---

// GET /api/media?type=image|video
mediaRouter.get('/', async (req, res) => {
  const type = req.query.type as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const businessId = req.user!.businessId;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const role = req.user!.role;

  try {
    const now = new Date();
    const where: any = { businessId };
    if (type === 'image' || type === 'video') where.type = type;

    // Staff only see published/immediately-available media
    if (role === 'staff') {
      where.OR = [
        { scheduledPublishAt: null },
        { scheduledPublishAt: { lte: now } },
        { published: true },
      ];
    }

    const items = await withTenant(businessId as string, (tx) =>
      tx.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, type: true, title: true, mimeType: true, fileSize: true,
          scheduledPublishAt: true, published: true, createdAt: true,
          uploadedById: true,
        },
      }),
    );
    ok(res, items);
  } catch (e) {
    console.error('[media/list]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/media/upload — single or bulk (up to 20 files)
mediaRouter.post(
  '/upload',
  requireRole('media_admin', 'business_admin'),
  uploadMedia.array('files', 20),
  async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      err(res, 400, 'validation_error', 'No files uploaded');
      return;
    }

    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    // Optional: per-file titles as JSON array, or a single title for one file
    let titles: (string | undefined)[] = [];
    try {
      titles = req.body.titles ? JSON.parse(req.body.titles) : [];
    } catch {
      titles = [];
    }

    // Optional: single scheduledPublishAt for all files
    let scheduledPublishAt: Date | null = null;
    if (req.body.scheduledPublishAt) {
      const d = new Date(req.body.scheduledPublishAt);
      if (!isNaN(d.getTime())) scheduledPublishAt = d;
    }

    // Enforce plan storage limit
    try {
      const totalUploadBytes = files.reduce((sum, f) => sum + f.size, 0);
      const [storageUsed, business] = await Promise.all([
        withTenant(businessId, (tx) =>
          tx.media.aggregate({ _sum: { fileSize: true }, where: { businessId } }),
        ),
        withSystem((tx) =>
          tx.business.findUnique({ where: { id: businessId }, include: { plan: true } }),
        ),
      ]);
      const usedBytes = Number(storageUsed._sum.fileSize ?? 0);
      const maxBytes = (business?.plan?.maxStorageMb ?? 5120) * 1024 * 1024;
      if (usedBytes + totalUploadBytes > maxBytes) {
        files.forEach((f) => deleteFile(f.path));
        err(res, 403, 'storage_limit', 'Storage limit reached for your plan');
        return;
      }
    } catch (e) {
      files.forEach((f) => deleteFile(f.path));
      console.error('[media/upload storage check]', e);
      err(res, 500, 'server_error', 'Unexpected error');
      return;
    }

    try {
      const created = await Promise.all(
        files.map(async (file, i) => {
          const title = titles[i] || (await generateAutoTitle(businessId));
          const mediaType = ALLOWED_IMAGE_MIMES.has(file.mimetype) ? 'image' : 'video';
          const fileName = file.filename;
          const filePath = `/storage/${businessId}/${fileName}`;

          return withTenant(businessId, (tx) =>
            tx.media.create({
              data: {
                businessId,
                type: mediaType,
                title,
                fileName,
                filePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadedById: userId,
                scheduledPublishAt,
                published: scheduledPublishAt === null,
              },
              select: { id: true, type: true, title: true, scheduledPublishAt: true, published: true },
            }),
          );
        }),
      );
      ok(res, created, 201);
    } catch (e) {
      files.forEach((f) => deleteFile(f.path));
      console.error('[media/upload]', e);
      err(res, 500, 'server_error', 'Unexpected error');
    }
  },
);

// GET /api/media/:id — metadata
mediaRouter.get('/:id', async (req, res) => {
  const businessId = req.user!.businessId;
  const role = req.user!.role;
  try {
    const media = await withTenant(businessId, (tx) =>
      tx.media.findUnique({ where: { id: req.params.id } }),
    );
    if (!media || !isVisible(media, role)) {
      err(res, 404, 'not_found', 'Media not found');
      return;
    }
    ok(res, media);
  } catch (e) {
    console.error('[media/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// GET /api/media/:id/preview — serve file for display only (no event recorded)
mediaRouter.get('/:id/preview', async (req, res) => {
  const businessId = req.user!.businessId;
  const role = req.user!.role;
  try {
    const media = await withTenant(businessId, (tx) =>
      tx.media.findUnique({ where: { id: req.params.id } }),
    );
    if (!media || !isVisible(media, role)) { res.status(404).end(); return; }
    const absPath = path.join(config.storageDir, '..', media.filePath);
    if (!fs.existsSync(absPath)) { res.status(404).end(); return; }
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(absPath).pipe(res);
  } catch (e) {
    console.error('[media/preview]', e);
    res.status(500).end();
  }
});

// GET /api/media/:id/download — stream file (all roles)
mediaRouter.get('/:id/download', async (req, res) => {
  const businessId = req.user!.businessId;
  const role = req.user!.role;
  const userId = req.user!.userId;

  try {
    const media = await withTenant(businessId, (tx) =>
      tx.media.findUnique({ where: { id: req.params.id } }),
    );
    if (!media || !isVisible(media, role)) {
      err(res, 404, 'not_found', 'Media not found');
      return;
    }

    // Resolve absolute path from stored relative path
    const absPath = path.join(config.storageDir, '..', media.filePath);
    if (!fs.existsSync(absPath)) {
      err(res, 404, 'not_found', 'File not found on disk');
      return;
    }

    // Record download event (non-blocking)
    withTenant(businessId, (tx) =>
      tx.mediaEvent.create({
        data: { businessId, mediaId: media.id, userId, eventType: 'download' },
      }),
    ).catch(() => {/* don't fail the download if event logging fails */});

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(media.title)}"`);
    fs.createReadStream(absPath).pipe(res);
  } catch (e) {
    console.error('[media/download]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/media/:id
mediaRouter.delete('/:id', requireRole('media_admin', 'business_admin'), async (req, res) => {
  const businessId = req.user!.businessId;
  try {
    const media = await withTenant(businessId, (tx) =>
      tx.media.findUnique({ where: { id: req.params.id } }),
    );
    if (!media) { err(res, 404, 'not_found', 'Media not found'); return; }

    // Delete from DB first, then disk (if DB fails, file stays — no orphan leak)
    await withTenant(businessId, (tx) => tx.media.delete({ where: { id: req.params.id } }));
    deleteFile(path.join(config.storageDir, '..', media.filePath));

    ok(res, { message: 'Media deleted' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Media not found'); return; }
    console.error('[media/delete]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PATCH /api/media/:id — update title or scheduled publish time
mediaRouter.patch('/:id', requireRole('media_admin', 'business_admin'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    scheduledPublishAt: z.string().datetime().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const data: any = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.scheduledPublishAt !== undefined) {
    data.scheduledPublishAt = parsed.data.scheduledPublishAt
      ? new Date(parsed.data.scheduledPublishAt)
      : null;
    data.published = data.scheduledPublishAt === null;
  }

  try {
    const media = await withTenant(req.user!.businessId, (tx) =>
      tx.media.update({ where: { id: req.params.id }, data,
        select: { id: true, title: true, scheduledPublishAt: true, published: true } }),
    );
    ok(res, media);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Media not found'); return; }
    console.error('[media/patch]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});
