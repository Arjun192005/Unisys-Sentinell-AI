import { Router, Request, Response, NextFunction } from 'express';
import { getAgentRules, updateRule, toggleRule } from '../services/agentService';
import { requireAuth } from '../middleware/requireAuth';
import { ApiResponse } from '../types';

const router = Router();

// Rules require auth — only ADMIN can modify rules
router.use(requireAuth);

// GET /api/rules — list all agent rules
router.get('/', (_req: Request, res: Response) => {
  const rules = getAgentRules();
  res.json({ success: true, data: rules } satisfies ApiResponse);
});

// PATCH /api/rules/:key — update a rule's value
router.patch('/:key', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      res.status(400).json({ success: false, error: 'Rule value is required' } satisfies ApiResponse);
      return;
    }

    updateRule(key, value);
    const rules = getAgentRules();
    const updated = rules.find((r) => r.rule_key === key);

    if (!updated) {
      res.status(404).json({ success: false, error: 'Rule not found' } satisfies ApiResponse);
      return;
    }

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rules/:key/toggle — enable or disable a rule
router.patch('/:key/toggle', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled (boolean) is required' } satisfies ApiResponse);
      return;
    }

    toggleRule(key, enabled);
    const rules = getAgentRules();
    const updated = rules.find((r) => r.rule_key === key);

    res.json({ success: true, data: updated } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

export default router;
