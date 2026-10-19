import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { getServiceLogger, sanitizeLogValue } from "../utils/loggerCreator";

const httpLogger = getServiceLogger("http");

// ─── IP extraction ───────────────────────────────────────────────────────────

/**
 * Reads the client IP from req.ip, which honours Express's `trust proxy`
 * setting. Falls back to the raw socket address only when req.ip is absent.
 *
 * Configure trust proxy at the Express app level:
 *   app.set("trust proxy", 1);               // behind one reverse proxy (nginx/ALB)
 *   app.set("trust proxy", "loopback");       // local dev
 *
 * Do NOT read x-forwarded-for directly here — Express already validates it.
 */
function resolveClientIp(req: Request): string {
  return sanitizeLogValue(req.ip ?? req.socket?.remoteAddress ?? "unknown", 64);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that:
 *  - Assigns / propagates a request ID (honours upstream X-Request-ID header)
 *  - Logs the incoming request via Winston
 *  - Logs the completed response with duration in ms and appropriate log level
 *  - Guards against double-logging when both `finish` and `close` fire
 *
 * Mount as the FIRST middleware:
 *   app.use(requestLogger);
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ── Request ID ─────────────────────────────────────────────────────────────
  const requestId =
    sanitizeLogValue(req.headers["x-request-id"] as string | undefined, 128) ||
    randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  // ── High-resolution timer ──────────────────────────────────────────────────
  const startHr = process.hrtime.bigint();

  // ── Sanitise user-supplied values ─────────────────────────────────────────
  const method = sanitizeLogValue(req.method, 16);
  const url = sanitizeLogValue(req.originalUrl || req.url, 512);
  const ip = resolveClientIp(req);
  const userAgent = sanitizeLogValue(req.headers["user-agent"], 256);

  // ── Inbound log ────────────────────────────────────────────────────────────
  httpLogger.info("→ request", { requestId, method, url, ip, userAgent });

  // ── Outbound log (once, whichever event fires first) ──────────────────────
  let logged = false;

  const logFinish = () => {
    if (logged) return;
    logged = true;

    const durationMs = +(Number(process.hrtime.bigint() - startHr) / 1e6).toFixed(2);
    const { statusCode } = res;
    const contentLength = res.getHeader("content-length");

    const logFn =
      statusCode >= 500
        ? httpLogger.error.bind(httpLogger)
        : statusCode >= 400
        ? httpLogger.warn.bind(httpLogger)
        : httpLogger.info.bind(httpLogger);

    logFn("← response", {
      requestId,
      method,
      url,
      statusCode,
      durationMs,
      ...(contentLength !== undefined ? { contentLength } : {}),
    });
  };

  res.on("finish", logFinish); // normal completion
  res.on("close", logFinish);  // client disconnected early

  next();
}
