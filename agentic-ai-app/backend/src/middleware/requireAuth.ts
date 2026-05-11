/**
 * Auth middleware — validates the Bearer token on every protected route.
 * Attaches the session to req so downstream handlers can read role/userId.
 */

import { Request, Response, NextFunction } from 'express';
import { getSession, AuthSession } from '../services/authService';

// Extend Express Request to carry the session
declare global {
  namespace Express {
    interface Request {
      session?: AuthSession;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ success: false, error: 'Invalid or expired session token' });
    return;
  }

  req.session = session;
  next();
}
