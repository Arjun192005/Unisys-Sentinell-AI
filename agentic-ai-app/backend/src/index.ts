import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import { initDatabase } from './db/database';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: [CORS_ORIGIN, 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  // Check Ollama connection
  const { healthCheck } = await import('./services/ollamaService');
  const ollamaHealthy = await healthCheck();
  
  res.json({
    status: ollamaHealthy ? 'ok' : 'degraded',
    service: 'agentic-ai-backend',
    port: PORT,
    timestamp: new Date().toISOString(),
    ollama: {
      connected: ollamaHealthy,
      url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  // Initialize DB on startup (async for sql.js WASM loading)
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`\n🚀 Agentic AI Backend running on http://localhost:${PORT}`);
    console.log(`   API:    http://localhost:${PORT}/api`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   CORS:   ${CORS_ORIGIN}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
