import { Router, Request, Response, NextFunction } from 'express';
import { listModels, pullModel, healthCheck } from '../services/ollamaService';
import { ApiResponse } from '../types';

const router = Router();

// GET /api/models — list available Ollama models
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await listModels();
    res.json({ success: true, data: models } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/models/pull — pull a model from Ollama registry
router.post('/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: 'Model name is required' } satisfies ApiResponse);
      return;
    }

    // Stream pull progress via SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ status: 'pulling', model: name })}\n\n`);

    await pullModel(name);

    res.write(`data: ${JSON.stringify({ status: 'success', model: name })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ status: 'error', error: String(err) })}\n\n`);
      res.end();
    } else {
      next(err);
    }
  }
});

// GET /api/models/health — check if Ollama is running
router.get('/health', async (_req: Request, res: Response) => {
  const healthy = await healthCheck();
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: { ollama: healthy ? 'online' : 'offline' },
  } satisfies ApiResponse);
});

export default router;
