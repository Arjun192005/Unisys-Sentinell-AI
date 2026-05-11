import { Router, Request, Response } from 'express';
import { login, logout, getDemoUsers } from '../services/authService';
import { ApiResponse } from '../types';

const router = Router();

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required' } satisfies ApiResponse);
    return;
  }

  const session = login(email, password);
  if (!session) {
    res.status(401).json({ success: false, error: 'Invalid email or password' } satisfies ApiResponse);
    return;
  }

  res.json({
    success: true,
    data: {
      token: session.token,
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        name: session.name,
      },
    },
  } satisfies ApiResponse);
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    logout(authHeader.slice(7));
  }
  res.json({ success: true, message: 'Logged out' } satisfies ApiResponse);
});

// GET /api/auth/me — returns current session info
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Not authenticated' } satisfies ApiResponse);
    return;
  }
  const { getSession } = require('../services/authService');
  const session = getSession(authHeader.slice(7));
  if (!session) {
    res.status(401).json({ success: false, error: 'Invalid or expired session' } satisfies ApiResponse);
    return;
  }
  res.json({
    success: true,
    data: {
      id: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
    },
  } satisfies ApiResponse);
});

// GET /api/auth/demo-users — returns the three demo accounts (no passwords)
router.get('/demo-users', (_req: Request, res: Response) => {
  res.json({ success: true, data: getDemoUsers() } satisfies ApiResponse);
});

export default router;
