import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT ?? 3010);

// --- Security baseline (see CLAUDE.md §9) ---
app.disable('x-powered-by');
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : false, // strict allowlist; deny by default
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({
    data: { status: 'ok', service: 'pixsignpro-api', time: new Date().toISOString() },
  });
});

// --- Default-deny catch-all: nothing is reachable unless explicitly routed ---
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[pixsignpro-api] listening on :${PORT}`);
});
