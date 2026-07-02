import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './routes/auth';
import { err } from './lib/response';

const app = express();

// --- Security baseline (see CLAUDE.md §9) ---
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
// Tight limit on auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'too_many_requests', message: 'Too many requests, slow down.' } },
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// --- Health check (no auth) ---
app.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'pixsignpro-api', time: new Date().toISOString() } });
});

// --- Routes ---
app.use('/api/auth', authRouter);

// --- Default-deny: nothing reachable unless explicitly routed ---
app.use((_req, res) => {
  err(res, 404, 'not_found', 'Not found');
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[pixsignpro-api] listening on :${config.port} (${config.nodeEnv})`);
});
