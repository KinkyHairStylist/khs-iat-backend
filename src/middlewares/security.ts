import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { getServiceLogger } from "../utils/loggerCreator";
import { NODE_ENV } from "../config/env";

const logger = getServiceLogger("security");

// ─── Hardened helmet configuration ───────────────────────────────────────────

export const securityHeaders = helmet({
  // Strict Content-Security-Policy — tighten per-route if you add inline scripts
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: NODE_ENV === "production" ? [] : null,
    },
  },
  // Strict Transport Security: 1 year, include subdomains, allow preload
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
    preload: true,
  },
  // Disable browser DNS prefetching to prevent info leakage
  dnsPrefetchControl: { allow: false },
  // Prevent MIME-type sniffing
  noSniff: true,
  // Deny iframes entirely (clickjacking protection)
  frameguard: { action: "deny" },
  // Disable FLoC / Topics API
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  // Hide X-Powered-By
  hidePoweredBy: true,
  // XSS filter (legacy browsers)
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: false, // only needed for SharedArrayBuffer
});

// ─── Attack pattern detection ─────────────────────────────────────────────────

const ATTACK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\.\.(\/|\\)/,                        label: "path-traversal"       },
  { pattern: /\/(etc\/passwd|proc\/self|windows\/)/i, label: "system-file-access" },
  { pattern: /<script[\s>]/i,                       label: "xss-in-path"          },
  { pattern: /\$\{.*?\}/,                           label: "template-injection"   },
  { pattern: /\0/,                                  label: "null-byte"            },
  { pattern: /%00/,                                 label: "null-byte-encoded"    },
  { pattern: /\bexec\s*\(/i,                        label: "code-injection"       },
];

// SQL injection detection — checks decoded body + query strings
const SQL_PATTERN =
  /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set|xp_cmdshell|exec\s*\(|sleep\s*\(|benchmark\s*\()\b/i;

// Allowed content types for request bodies
const BODY_CONTENT_TYPES = ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"];

// decodeURIComponent throws on a stray "%" (e.g. a password like "Pass%word"),
// so fall back to the raw value instead of crashing the request with a 500.
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function detectSqlInjection(value: string): boolean {
  return SQL_PATTERN.test(value) || SQL_PATTERN.test(safeDecode(value));
}

function scanObject(obj: unknown, depth = 0): boolean {
  if (depth > 4) return false; // limit recursion depth
  if (typeof obj === "string") return detectSqlInjection(obj);
  if (Array.isArray(obj)) return obj.some((v) => scanObject(v, depth + 1));
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).some((v) =>
      scanObject(v, depth + 1)
    );
  }
  return false;
}

// ─── Request guard middleware ─────────────────────────────────────────────────

export function requestGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const target = req.originalUrl;

  // 1. Block known attack patterns in the URL
  for (const { pattern, label } of ATTACK_PATTERNS) {
    if (pattern.test(target)) {
      logger.warn("Attack pattern blocked", {
        label,
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        requestId: res.locals.requestId,
      });
      res.status(400).json({ success: false, code: "BLOCKED_REQUEST", message: "This request couldn't be processed. Please check the address and try again." });
      return;
    }
  }

  // 2. SQL injection scan across query params and body
  if (scanObject(req.query) || (req.body && scanObject(req.body))) {
    logger.warn("SQL injection pattern detected", {
      ip: req.ip,
      method: req.method,
      path: req.path,
      requestId: res.locals.requestId,
    });
    res.status(400).json({
      success: false,
      code: "BLOCKED_INPUT",
      message: "Some of the text you entered isn't allowed. Please remove any unusual words or symbols and try again.",
    });
    return;
  }

  // 3. Enforce content-type on write methods
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const ct = req.headers["content-type"] ?? "";
    const allowed = BODY_CONTENT_TYPES.some((t) => ct.startsWith(t));
    if (ct && !allowed) {
      res.status(415).json({
        success: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "This type of data isn't supported. Please send the request as JSON or a form.",
      });
      return;
    }
  }

  // 4. Strip server fingerprinting (belt-and-suspenders with hidePoweredBy)
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");

  next();
}

// ─── Cache-control for API responses ─────────────────────────────────────────

export function noCache(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
}
