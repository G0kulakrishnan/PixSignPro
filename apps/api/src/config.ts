import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3010),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
  },
  // Mobile app JWT — separate secrets from the web portal.
  mobileJwt: {
    accessSecret: required('MOBILE_JWT_ACCESS_SECRET'),
    accessTtl: process.env.MOBILE_ACCESS_TTL ?? '15m',
    // Refresh tokens are opaque + DB-backed; TTL controlled here for the DB row.
    refreshTtlMs: Number(process.env.MOBILE_REFRESH_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000,
  },
  // HMAC secret for signing short-lived media URLs served to the mobile app.
  mediaSignSecret: required('MEDIA_SIGN_SECRET'),
  storageDir: process.env.STORAGE_DIR ?? './storage',
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES ?? 500 * 1024 * 1024),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Base URL for building absolute media URLs returned to the mobile app.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'https://dev.pixsign.in').replace(/\/$/, ''),
};
