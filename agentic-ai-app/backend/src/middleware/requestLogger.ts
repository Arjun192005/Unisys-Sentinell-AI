import morgan from 'morgan';
import { Request, Response } from 'express';

/**
 * HTTP request logger using morgan.
 * Uses 'dev' format in development, 'combined' in production.
 */
export const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  {
    skip: (_req: Request, res: Response) => {
      // Skip health check logs to reduce noise
      return res.statusCode < 400 && _req.path === '/health';
    },
  }
);
