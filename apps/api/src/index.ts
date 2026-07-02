import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { profileRouter } from './routes/profile';
import { mediaRouter } from './routes/media';
import { analyticsRouter } from './routes/analytics';
import { eventsRouter } from './routes/events';
import { plansRouter } from './routes/admin/plans';
import { businessesRouter } from './routes/admin/businesses';
import { overviewRouter } from './routes/admin/overview';
import { legacyRouter } from './routes/legacy';
import { publicFilesRouter } from './routes/legacy/publicFiles';
import { err } from './lib/response';

const app = express();

// --- Security baseline ---
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// --- Rate limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'too_many_requests', message: 'Too many requests, slow down.' } },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/pro/api', apiLimiter);

// --- Health check (no auth) ---
app.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'pixsignpro-api', time: new Date().toISOString() } });
});

// --- Routes ---
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/profile', profileRouter);
app.use('/api/media', mediaRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/admin/plans', plansRouter);
app.use('/api/admin/businesses', businessesRouter);
app.use('/api/admin/overview', overviewRouter);

// --- Legacy mobile-app compatibility (Flutter app; see MOBILE_API_PLAN.md) ---
app.use('/uploads', publicFilesRouter);   // public, unguessable UUID capability URLs
app.use('/pro/api', legacyRouter);          // /pro/api/*.php contract

// --- Default-deny ---
app.use((_req, res) => {
  err(res, 404, 'not_found', 'Not found');
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[pixsignpro-api] listening on :${config.port} (${config.nodeEnv})`);
});
