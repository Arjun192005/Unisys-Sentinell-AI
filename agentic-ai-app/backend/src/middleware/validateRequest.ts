import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

/**
 * Validates that required fields are present in req.body.
 */
export function requireFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        return next(createError(`Missing required field: ${field}`, 400));
      }
    }
    next();
  };
}

/**
 * Validates that a session_id param exists and is a valid UUID format.
 */
export function validateSessionId(req: Request, _res: Response, next: NextFunction): void {
  const id = req.params.sessionId ?? req.body.session_id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (id && !uuidRegex.test(id)) {
    return next(createError('Invalid session ID format', 400));
  }
  next();
}
