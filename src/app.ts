import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import redis from "./lib/redis/redis";
import { isDbConnected } from "./lib/prisma/dbWatcher";
import { isRedisConnected } from "./lib/redis/redisWatcher";
import { createRateLimitHandler } from "./utils/rateLimit";
import { CORS_ORIGINS, NODE_ENV, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./config/env";
import {
  securityHeaders,
  requestGuard,
  noCache,
  requestLogger,
  responseFormatter,
  dbReady,
  errorHandler,
  createDocsRouter,
  csrfGuard,
} from "./middlewares";

import router from "./routes";

const app: Application = express();

// ─── 1. Trust proxy (required before rate-limit / IP detection) ───────────────
app.set("trust proxy", 1);

// ─── 2. Security headers (helmet-based) ──────────────────────────────────────
app.use(securityHeaders);

// ─── 3. Request ID — stamps every request before any other middleware ─────────
app.use(requestLogger);

// ─── 4. Standardised response helpers ────────────────────────────────────────
app.use(responseFormatter);

// ─── 5. CORS ──────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Request-ID", "X-Requested-With"],
    // Lets browsers cache the preflight for 10 minutes.
    maxAge: 600,
    exposedHeaders: ["X-Request-ID"],
  })
);

// ─── 6. Compression ──────────────────────────────────────────────────────────
app.use(compression());

// ─── 7. HTTP parameter pollution prevention ───────────────────────────────────
// Repeated query keys collapse to the last value, except where a list is
// expected (salon search: ?services=a&services=b).
app.use(hpp({ whitelist: ["services", "services[]"] }));

// ─── 8. Redis-backed global rate limiter ─────────────────────────────────────
// Counts are stored in Redis so limits are accurate across all cluster workers.
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // Own prefix so a Redis shared with khs-iat-staff-be never mixes counters.
      prefix: "rl:customer:global:",
      sendCommand: (...args: string[]) =>
        redis.call(args[0], ...args.slice(1)) as Promise<number>,
    }),
    handler: createRateLimitHandler(RATE_LIMIT_WINDOW_MS),
    skip: (req) => req.path === "/api/v1/health",
  })
);

// ─── 9. Body parsing ──────────────────────────────────────────────────────────
// Small bodies everywhere except where a bigger one is the point — add a
// route here when a ported customer module needs one.
const jsonSmall = express.json({ limit: "10kb" });
const LARGE_JSON_ROUTES: Array<{ match: RegExp; parser: ReturnType<typeof express.json> }> = [
  // A support message may carry a 1 MB image as base64.
  { match: /^\/api\/v1\/support\/messages$/, parser: express.json({ limit: "1600kb" }) },
];
app.use((req, res, next) => (LARGE_JSON_ROUTES.find((r) => r.match.test(req.path))?.parser ?? jsonSmall)(req, res, next));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// ─── 10. Attack-pattern guard + content-type enforcement ─────────────────────
app.use(requestGuard);

// ─── 10b. CSRF guard — custom header + Origin check on every write ───────────
app.use(csrfGuard);

// ─── 11. No-cache for all API responses ──────────────────────────────────────
app.use(noCache);

// ─── API docs (before dbReady — no DB needed to serve docs) ─────────────────
app.use("/docs", createDocsRouter());

// ─── Health check (before dbReady so it always responds) ─────────────────────
app.get("/api/v1/health", (_req: Request, res: Response) => {
  const db    = isDbConnected();
  const cache = isRedisConnected();
  const ok    = db && cache;

  res.status(ok ? 200 : 503).json({
    success: ok,
    status: ok ? "ok" : "degraded",
    uptime: process.uptime(),
    env: NODE_ENV,
    database: db    ? "connected" : "unreachable",
    redis:    cache ? "connected" : "unreachable",
    timestamp: new Date().toISOString(),
  });
});

// ─── 12. DB gate — blocks all routes below when DB is down ───────────────────
app.use(dbReady);

// ─── 13. API routes ───────────────────────────────────────────────────────────
app.use("/api/v1", router);

// ─── 14. 404 handler ─────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "We couldn't find what you're looking for. Please check the address and try again.",
    timestamp: new Date().toISOString(),
  });
});

// ─── 15. Central error handler (must be last) ────────────────────────────────
app.use(errorHandler);

export default app;
