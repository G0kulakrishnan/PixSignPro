// Multer for legacy mobile uploads. The app has no JWT, so we can't know the
// business dir up-front — write to a temp dir, then move into the resolved
// business folder inside the handler (see finalizeFile).

import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config';
import { businessStorageDir } from '../../lib/storage';
import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES } from '../../middleware/upload';

const ALLOWED = new Set([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]);

const tmpDir = path.join(config.storageDir, '_legacy_tmp');

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const legacyUpload = multer({
  storage: tmpStorage,
  limits: { fileSize: Number(config.maxFileSizeBytes ?? 500 * 1024 * 1024), files: 2 },
  fileFilter: (_req, file, cb) => {
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

/**
 * Move an uploaded temp file into the business storage dir under a UUID name.
 * Returns the stored `/storage/<businessId>/<filename>` path.
 */
export function finalizeFile(tmpPath: string, businessUuid: string, originalName: string): string {
  const dir = businessStorageDir(businessUuid);
  const fileName = `${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
  const dest = path.join(dir, fileName);
  fs.renameSync(tmpPath, dest);
  return `/storage/${businessUuid}/${fileName}`;
}

export function cleanupTmp(tmpPath: string | undefined): void {
  if (!tmpPath) return;
  try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
}
