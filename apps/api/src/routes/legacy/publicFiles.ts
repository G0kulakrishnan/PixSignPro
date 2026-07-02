// Public, unauthenticated media serving for the mobile app.
// Files are UUID-named (122-bit random) → effectively unguessable capability URLs.
// This is a deliberate, documented exception to "media only via authorized endpoints":
// the legacy Flutter app loads images with no auth header (CachedNetworkImage).

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

export const publicFilesRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i; // <uuid>.<ext>, no path separators

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.webm': 'video/webm', '.mpeg': 'video/mpeg',
};

// GET /uploads/:businessId/:filename
publicFilesRouter.get('/:businessId/:filename', (req, res) => {
  const { businessId, filename } = req.params;

  if (!UUID_RE.test(businessId) || !FILENAME_RE.test(filename)) {
    res.status(404).end();
    return;
  }

  const baseDir = path.resolve(config.storageDir, businessId);
  const absPath = path.resolve(baseDir, filename);
  // Defense-in-depth against traversal: resolved path must stay inside the business dir.
  if (!absPath.startsWith(baseDir + path.sep)) {
    res.status(404).end();
    return;
  }
  if (!fs.existsSync(absPath)) {
    res.status(404).end();
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', EXT_MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(absPath).pipe(res);
});
