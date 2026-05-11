import { Router, Request, Response, NextFunction } from 'express';
import { agentChat, agentChatStream, createSession, getSession } from '../services/agentService';
import { scanWithSentinel, tokenizePrompt, logSentinelWithMask } from '../services/sentinelService';
import { requireAuth } from '../middleware/requireAuth';
import { requireFields } from '../middleware/validateRequest';
import { createError } from '../middleware/errorHandler';
import { chatLimiter } from '../middleware/rateLimiter';
import { ApiResponse } from '../types';

const router = Router();
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';

router.use(requireAuth);

// ─── POST /api/chat — non-streaming ──────────────────────────────────────────
router.post(
  '/',
  chatLimiter,
  requireFields('message'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, model = DEFAULT_MODEL } = req.body;
      const { userId, role } = req.session!;
      let { session_id } = req.body;

      // STEP 1: Tokenize PII and check action (ALLOW/TOKENIZE/BLOCK)
      const tokenized = await tokenizePrompt(message, userId);
      
      // BLOCK if action is BLOCK (threats/credentials), but ALLOW if TOKENIZE (just PII)
      if (tokenized.action === 'BLOCK') {
        // ── LOG BLOCKED PROMPT to SentinelAI before returning 403 ──────────
        const promptScan = await scanWithSentinel(message, userId, role, 'prompt');
        logSentinelWithMask(message, message, userId, role, promptScan).catch(() => {});

        res.status(403).json({
          success: false,
          error: 'Your message was blocked by the SentinelAI security gateway.',
          sentinel: {
            status: 'BLOCK',
            riskScore: 60,
            riskLevel: 'HIGH',
            detectedTypes: tokenized.detectedTypes,
            explanation: 'Prompt contains sensitive credentials or adversarial content.',
            semanticFlags: [],
          },
        } satisfies ApiResponse);
        return;
      }

      // STEP 2: Use masked text for LLM (PII replaced with tokens)
      const messageToLLM = tokenized.masked ?? message;
      
      // STEP 3: Scan for advanced threats (semantic analysis)
      const promptScan = await scanWithSentinel(message, userId, role, 'prompt');

      // ── BLOCK if prompt scan failed (semantic threats detected) ──────────────
      if (!promptScan.allowed) {
        // Log to SentinelAI
        logSentinelWithMask(message, messageToLLM, userId, role, promptScan).catch(() => {});

        res.status(403).json({
          success: false,
          error: 'Your message was blocked by the SentinelAI security gateway.',
          sentinel: {
            status: promptScan.status,
            riskScore: promptScan.riskScore,
            riskLevel: promptScan.riskLevel,
            detectedTypes: promptScan.detectedTypes,
            explanation: promptScan.explanation,
            semanticFlags: promptScan.semanticFlags,
          },
        } satisfies ApiResponse);
        return;
      }

      // Log prompt to SentinelAI with masked text (original stored encrypted, masked shown)
      logSentinelWithMask(message, messageToLLM, userId, role, promptScan).catch(() => {});

      if (!session_id) {
        session_id = createSession(model, userId).id;
      } else if (!getSession(session_id)) {
        return next(createError('Session not found', 404));
      }

      // STEP 4: Generate LLM response with masked message
      const result = await agentChat(session_id, message, model, messageToLLM);

      // STEP 5: Scan LLM response
      const responseScan = await scanWithSentinel(result.content, userId, role, 'response');
      if (!responseScan.allowed) {
        res.status(403).json({
          success: false,
          error: 'The AI response was blocked by the SentinelAI security gateway.',
          sentinel: {
            status: responseScan.status,
            riskScore: responseScan.riskScore,
            riskLevel: responseScan.riskLevel,
            explanation: responseScan.explanation,
          },
        } satisfies ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: {
          session_id,
          message_id: result.messageId,
          content: result.content,
          role: 'assistant',
          tokens: result.tokens,
          model,
          sentinel: {
            promptScan: {
              status: promptScan.status,
              riskScore: promptScan.riskScore,
              wasTokenized: tokenized.wasTokenized,
            },
            responseScan: { status: responseScan.status, riskScore: responseScan.riskScore },
          },
        },
      } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/chat/stream — SSE streaming ────────────────────────────────────
router.post(
  '/stream',
  chatLimiter,
  requireFields('message'),
  async (req: Request, res: Response, next: NextFunction) => {
    let clientGone = false;
    req.on('close', () => { clientGone = true; });

    try {
      const { message, model = DEFAULT_MODEL } = req.body;
      const { userId, role } = req.session!;
      let { session_id } = req.body;

      // STEP 1: Tokenize PII and check action (ALLOW/TOKENIZE/BLOCK)
      const tokenized = await tokenizePrompt(message, userId);
      
      // BLOCK if action is BLOCK (threats/credentials), but ALLOW if TOKENIZE (just PII)
      if (tokenized.action === 'BLOCK') {
        // ── LOG BLOCKED PROMPT to SentinelAI before returning 403 ──────────
        const promptScan = await scanWithSentinel(message, userId, role, 'prompt');
        logSentinelWithMask(message, message, userId, role, promptScan).catch(() => {});

        res.status(403).json({
          success: false,
          error: 'Your message was blocked by the SentinelAI security gateway.',
          sentinel: {
            status: 'BLOCK',
            riskScore: 60,
            riskLevel: 'HIGH',
            detectedTypes: tokenized.detectedTypes,
            explanation: 'Prompt contains sensitive credentials or adversarial content.',
            semanticFlags: [],
          },
        } satisfies ApiResponse);
        return;
      }

      // STEP 2: Use masked text for LLM (PII replaced with tokens)
      const messageToLLM = tokenized.masked ?? message;

      if (tokenized.wasTokenized) {
        console.log(
          `[Chat] PII masked before LLM | detected=${tokenized.detectedTypes.join(',')} | user=${userId}`
        );
      }
      
      // STEP 3: Scan for advanced threats (semantic analysis)
      const promptScan = await scanWithSentinel(message, userId, role, 'prompt');

      // ── BLOCK if prompt scan failed (semantic threats detected) ──────────────
      if (!promptScan.allowed) {
        // Log to SentinelAI
        logSentinelWithMask(message, messageToLLM, userId, role, promptScan).catch(() => {});

        res.status(403).json({
          success: false,
          error: 'Your message was blocked by the SentinelAI security gateway.',
          sentinel: {
            status: promptScan.status,
            riskScore: promptScan.riskScore,
            riskLevel: promptScan.riskLevel,
            detectedTypes: promptScan.detectedTypes,
            explanation: promptScan.explanation,
            semanticFlags: promptScan.semanticFlags,
          },
        } satisfies ApiResponse);
        return;
      }

      // Log prompt to SentinelAI with masked text
      logSentinelWithMask(message, messageToLLM, userId, role, promptScan).catch(() => {});

      if (!session_id) {
        session_id = createSession(model, userId).id;
      } else if (!getSession(session_id)) {
        return next(createError('Session not found', 404));
      }

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write(`data: ${JSON.stringify({
        type: 'session',
        session_id,
        sentinel_prompt: {
          status: promptScan.status,
          riskScore: promptScan.riskScore,
          wasTokenized: tokenized.wasTokenized,
          detectedTypes: tokenized.detectedTypes,
          originalPrompt: message,
          maskedPrompt: messageToLLM,
        },
      })}\n\n`);

      // STEP 4: Stream LLM response using the MASKED message
      let fullContent = '';

      const { messageId, tokens } = await agentChatStream(
        session_id,
        message,        // original — saved to DB, shown in UI
        model,
        (chunk) => {
          if (!clientGone && chunk) {
            fullContent += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          }
        },
        messageToLLM   // masked — sent to Ollama
      );

      // STEP 5: Scan LLM response before sending 'done'
      if (!clientGone && fullContent) {
        const responseScan = await scanWithSentinel(fullContent, userId, role, 'response');

        if (!responseScan.allowed) {
          res.write(`data: ${JSON.stringify({
            type: 'response_blocked',
            error: 'The AI response was blocked by the SentinelAI security gateway.',
            sentinel: {
              status: responseScan.status,
              riskScore: responseScan.riskScore,
              riskLevel: responseScan.riskLevel,
              detectedTypes: responseScan.detectedTypes,
              explanation: responseScan.explanation,
            },
          })}\n\n`);
          res.end();
          return;
        }

        res.write(`data: ${JSON.stringify({
          type: 'done',
          message_id: messageId,
          tokens,
          sentinel_response: { status: responseScan.status, riskScore: responseScan.riskScore },
        })}\n\n`);
      } else if (!clientGone) {
        res.write(`data: ${JSON.stringify({ type: 'done', message_id: messageId, tokens })}\n\n`);
      }

      if (!clientGone) res.end();
    } catch (err) {
      if (res.headersSent) {
        if (!clientGone) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
          res.end();
        }
      } else {
        next(err);
      }
    }
  }
);

export default router;
