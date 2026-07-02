import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import type { Request } from 'express';
import { businessStorageDir } from '../lib/storage';
import { config } from '../config';

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);
export const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mpeg',
]);
const ALLOWED_MIMES = new Set([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]);

// Profile pictures / logos — images only, 5MB max
const profileStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const businessId = req.user?.businessId;
    if (!businessId) return cb(new Error('Unauthorized'), '');
    cb(null, businessStorageDir(businessId));
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_IMAGE_MIMES.has(file.mimetype) ? cb(null, true) : cb(new Error('Only images allowed'));
  },
});

// Media uploads — images + videos, bulk (up to 20 files)
const mediaStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const businessId = req.user?.businessId;
    if (!businessId) return cb(new Error('Unauthorized'), '');
    cb(null, businessStorageDir(businessId));
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadMedia = multer({
  storage: mediaStorage,
  limits: {
    fileSize: Number(config.maxFileSizeBytes ?? 500 * 1024 * 1024),
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIMES.has(file.mimetype) ? cb(null, true) : cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});
