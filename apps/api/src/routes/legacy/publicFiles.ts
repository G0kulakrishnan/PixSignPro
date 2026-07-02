// Signed media serving for the mobile app.
// URLs carry ?exp=<unix>&sig=<hmac-sha256> — the server signs them when building
// list/profile responses. Expired or forged URLs return 403.
// UUID filenames (122-bit random) provide an additional unguessability layer.

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config';

export const publicFilesRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i;

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.webm': 'video/webm', '.mpeg': 'video/mpeg',
};

// GET /uploads/:businessId/:filename?exp=<ts>&sig=<hmac>
publicFilesRouter.get('/:businessId/:filename', (req, res) => {
  const { businessId, filename } = req.params;

  // --- 1. Validate path components ------------------------------------------
  if (!UUID_RE.test(businessId) || !FILENAME_RE.test(filename)) {
    res.status(404).end();
    return;
  }

  // --- 2. Validate signed URL (exp + sig required) --------------------------
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig ?? '');
  const nowSec = Math.floor(Date.now() / 1000);

  if (!exp || !sig) {
    res.status(403).end();
    return;
  }
  if (nowSec > exp) {
    res.status(403).end(); // link expired
    return;
  }

  const expected = crypto
    .createHmac('sha256', config.mediaSignSecret)
    .update(`${businessId}/${filename}/${exp}`)
    .digest('hex');

  let valid = false;
  try {
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(403).end();
    return;
  }

  // --- 3. Resolve and stream the file ---------------------------------------
  const baseDir = path.resolve(config.storageDir, businessId);
  const absPath = path.resolve(baseDir, filename);
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
  // Short cache — URLs expire in 1h, so cache slightly less.
  res.setHeader('Cache-Control', 'private, max-age=3000');
  fs.createReadStream(absPath).pipe(res);
});
