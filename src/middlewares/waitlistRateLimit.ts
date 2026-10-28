import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 20;
const ipBuckets = new Map<string, RateLimitEntry>();

// Periodically prune expired rate-limit buckets
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipBuckets.entries()) {
    if (now >= entry.resetAt) {
      ipBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000);

if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || "unknown";
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function waitlistRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = extractClientIp(req);
  const now = Date.now();
  const existing = ipBuckets.get(ip);

  if (!existing || now >= existing.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
    res.setHeader("X-RateLimit-Remaining", String(MAX_REQUESTS_PER_WINDOW - 1));
    next();
    return;
  }

  existing.count += 1;
  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - existing.count);
  const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);

  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (existing.count > MAX_REQUESTS_PER_WINDOW) {
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      ok: false,
      error: "Too many waitlist requests from this IP. Please try again later.",
    });
    return;
  }

  next();
}
