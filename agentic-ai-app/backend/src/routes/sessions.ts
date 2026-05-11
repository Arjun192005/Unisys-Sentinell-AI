import { Router, Request, Response, NextFunction } from 'express';
import {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  getSessionMessages,
  updateSessionTitle,
} from '../services/agentService';
import { validateSessionId } from '../middleware/validateRequest';
import { requireAuth } from '../middleware/requireAuth';
import { createError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

// All session routes require authentication
router.use(requireAuth);

// GET /api/sessions — list all sessions for the logged-in user
router.get('/', (req: Request, res: Response) => {
  const { userId } = req.session!;
  const sessions = listSessions(userId);
  res.json({ success: true, data: sessions } satisfies ApiResponse);
});

// POST /api/sessions — create a new session for the logged-in user
router.post('/', (req: Request, res: Response) => {
  const { userId } = req.session!;
  const model = req.body.model || process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';
  const title = req.body.title;
  const session = createSession(model, userId, title);
  res.status(201).json({ success: true, data: session } satisfies ApiResponse);
});

// GET /api/sessions/:sessionId — get session details (only if owned by user)
router.get('/:sessionId', validateSessionId, (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.session!;
  const session = getSession(req.params.sessionId);
  if (!session) return next(createError('Session not found', 404));
  if ((session as any).user_id !== userId) return next(createError('Forbidden', 403));
  res.json({ success: true, data: session } satisfies ApiResponse);
});

// PATCH /api/sessions/:sessionId — update session title (only if owned by user)
router.patch(
  '/:sessionId',
  validateSessionId,
  (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.session!;
    const session = getSession(req.params.sessionId);
    if (!session) return next(createError('Session not found', 404));
    if ((session as any).user_id !== userId) return next(createError('Forbidden', 403));

    const { title } = req.body;
    if (title) updateSessionTitle(req.params.sessionId, title);

    res.json({ success: true, data: getSession(req.params.sessionId) } satisfies ApiResponse);
  }
);

// DELETE /api/sessions/:sessionId — delete a session (only if owned by user)
router.delete(
  '/:sessionId',
  validateSessionId,
  (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.session!;
    const session = getSession(req.params.sessionId);
    if (!session) return next(createError('Session not found', 404));
    if ((session as any).user_id !== userId) return next(createError('Forbidden', 403));
    
    const deleted = deleteSession(req.params.sessionId);
    if (!deleted) return next(createError('Session not found', 404));
    res.json({ success: true, message: 'Session deleted' } satisfies ApiResponse);
  }
);

// GET /api/sessions/:sessionId/messages — get all messages (only if session owned by user)
router.get(
  '/:sessionId/messages',
  validateSessionId,
  (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.session!;
    const session = getSession(req.params.sessionId);
    if (!session) return next(createError('Session not found', 404));
    if ((session as any).user_id !== userId) return next(createError('Forbidden', 403));

    const messages = getSessionMessages(req.params.sessionId);
    res.json({ success: true, data: messages } satisfies ApiResponse);
  }
);

export default router;
