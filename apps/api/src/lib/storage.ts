import fs from 'fs';
import path from 'path';
import { config } from '../config';

export function businessStorageDir(businessId: string): string {
  const dir = path.join(config.storageDir, businessId);
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o700);
  return dir;
}

export function deleteFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }
}

export function fileSize(filePath: string): number {
  try { return fs.statSync(filePath).size; } catch { return 0; }
}
