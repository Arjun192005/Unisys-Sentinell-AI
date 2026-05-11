import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter — 100 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
});

/**
 * Stricter limiter for chat endpoints — 100 requests per minute per IP.
 * Increased from 30 to allow continuous conversation without hitting limits.
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Chat rate limit exceeded. Please wait before sending more messages.',
  },
});
