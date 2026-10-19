import rateLimit, { RateLimitRequestHandler, RateLimitExceededEventHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "../lib/redis/redis";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required TS idiom for augmenting Express types
  namespace Express {
    interface Request {
      /** Populated by express-rate-limit on every request it processes. */
      rateLimit?: { limit: number; used: number; remaining: number; resetTime?: Date };
    }
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Shared 429 handler — computes how long the caller actually has left to
 * wait (from the client's own reset time, not just the configured window)
 * and states it in both the human-readable message and a `retryAfterSeconds`
 * field for API consumers. `fallbackWindowMs` covers the rare case where
 * `req.rateLimit.resetTime` isn't available.
 */
export function createRateLimitHandler(fallbackWindowMs: number): RateLimitExceededEventHandler {
  return (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(((resetTime?.getTime() ?? Date.now() + fallbackWindowMs) - Date.now()) / 1000)
    );

    res.setHeader("Retry-After", retryAfterSeconds);
    res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      message: `You've made too many attempts. Please wait ${formatWait(retryAfterSeconds)} and try again.`,
      retryAfterSeconds,
    });
  };
}

/**
 * A Redis-backed limiter scoped to one route/purpose (its own key prefix, so
 * it never shares a counter with the app-wide limiter or other routes).
 * Counts are accurate across every cluster worker since they live in Redis.
 */
export function createRateLimiter(prefix: string, windowMs: number, max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:customer:${prefix}:`,
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
    }),
    handler: createRateLimitHandler(windowMs),
  });
}
