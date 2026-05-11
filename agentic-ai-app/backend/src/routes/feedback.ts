import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../db/database';
import { requireAuth } from '../middleware/requireAuth';
import { requireFields } from '../middleware/validateRequest';
import { ApiResponse } from '../types';

const router = Router();

router.use(requireAuth);

// ─── POST /api/feedback — Submit feedback for a message ──────────────────────
router.post(
  '/',
  requireFields('message_id', 'rating'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message_id, rating, comment, session_id } = req.body;

      if (![1, -1].includes(rating)) {
        res.status(400).json({
          success: false,
          error: 'Rating must be 1 (thumbs up) or -1 (thumbs down)',
        } satisfies ApiResponse);
        return;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      try {
        execute(
          `INSERT INTO feedback (id, session_id, message_id, rating, comment, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, session_id, message_id, rating, comment || null, now]
        );

        // ── Self-learning: Store pattern for future reference ──────────────────
        const message = queryOne('SELECT * FROM messages WHERE id = ?', [message_id]) as any;
        if (message && message.role === 'assistant') {
          // Get the user prompt that led to this response
          const userMsg = queryAll(
            `SELECT * FROM messages 
             WHERE session_id = ? AND created_at < ? AND role = 'user'
             ORDER BY created_at DESC LIMIT 1`,
            [message.session_id, message.created_at]
          )[0] as any;

          if (userMsg) {
            learnFromFeedback(userMsg.content, message.content, rating);
          }
        }

        res.json({
          success: true,
          data: { id, message: 'Feedback recorded successfully' },
        } satisfies ApiResponse);
      } catch (dbErr: any) {
        // If feedback tables don't exist, return graceful error
        if (dbErr.message?.includes('no such table')) {
          res.status(503).json({
            success: false,
            error: 'Feedback system not initialized. Please restart the backend.',
          } satisfies ApiResponse);
          return;
        }
        throw dbErr;
      }
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/feedback/stats — Get feedback statistics ───────────────────────
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      const stats = queryOne(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as negative
         FROM feedback`
      ) as any;

      res.json({
        success: true,
        data: stats,
      } satisfies ApiResponse);
    } catch (dbErr: any) {
      // If feedback table doesn't exist, return empty stats
      if (dbErr.message?.includes('no such table')) {
        res.json({
          success: true,
          data: { total: 0, positive: 0, negative: 0 },
        } satisfies ApiResponse);
        return;
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
});

// ─── Self-learning logic ──────────────────────────────────────────────────────
function learnFromFeedback(userPrompt: string, aiResponse: string, rating: number) {
  try {
    const patternType = rating === 1 ? 'good_response' : 'bad_response';
    
    // Check if similar pattern exists
    const existing = queryOne(
      `SELECT * FROM learned_patterns 
       WHERE pattern_type = ? AND context = ? LIMIT 1`,
      [patternType, userPrompt]
    ) as any;

    if (existing) {
      // Update frequency
      execute(
        `UPDATE learned_patterns 
         SET frequency = frequency + 1, updated_at = ?
         WHERE id = ?`,
        [new Date().toISOString(), existing.id]
      );
    } else {
      // Create new pattern
      const id = uuidv4();
      execute(
        `INSERT INTO learned_patterns (id, pattern_type, context, response, rating, frequency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, patternType, userPrompt, aiResponse, rating, new Date().toISOString(), new Date().toISOString()]
      );
    }
  } catch (err) {
    // Silently fail if learned_patterns table doesn't exist
    console.error('[Feedback] Failed to store learned pattern:', err);
  }
}

// ─── GET /api/feedback/learned — Get learned patterns ────────────────────────
router.get('/learned', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      const patterns = queryAll(
        `SELECT * FROM learned_patterns 
         ORDER BY frequency DESC, updated_at DESC 
         LIMIT 50`
      );

      res.json({
        success: true,
        data: patterns,
      } satisfies ApiResponse);
    } catch (dbErr: any) {
      // If learned_patterns table doesn't exist, return empty array
      if (dbErr.message?.includes('no such table')) {
        res.json({
          success: true,
          data: [],
        } satisfies ApiResponse);
        return;
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
