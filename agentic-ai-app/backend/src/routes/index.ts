/**
 * Central route registry — mounts all sub-routers under /api/*
 */
import { Router } from 'express';
import authRouter from './auth';
import sessionsRouter from './sessions';
import chatRouter from './chat';
import modelsRouter from './models';
import rulesRouter from './rules';
import feedbackRouter from './feedback';

const router = Router();

// Public — no auth required
router.use('/auth', authRouter);

// Protected — require Bearer token
router.use('/sessions', sessionsRouter);
router.use('/chat', chatRouter);
router.use('/models', modelsRouter);
router.use('/rules', rulesRouter);
router.use('/feedback', feedbackRouter);

export default router;
