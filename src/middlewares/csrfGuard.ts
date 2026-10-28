import { Request, Response, NextFunction } from "express";
import { CORS_ORIGINS } from "../config/env";
import { getServiceLogger } from "../utils/loggerCreator";

const logger = getServiceLogger("csrf-guard");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Every state-changing request must carry this header. A browser only lets a
// page send a custom header cross-origin after a CORS preflight, which our
// CORS policy refuses for any origin not in CORS_ORIGINS — so a forged form
// post or <img> from another site can never include it.
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "khs-customer";

/**
 * CSRF defence for cookie-authenticated requests, layered on SameSite
 * cookies: (1) the custom header above, (2) when the browser sends an Origin
 * (it always does on cross-origin writes), it must be one of ours.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const hasHeader = req.headers[CSRF_HEADER] === CSRF_HEADER_VALUE;
  const originAllowed = !origin || CORS_ORIGINS.includes(origin);

  if (!hasHeader || !originAllowed) {
    logger.warn("Blocked cross-site request", {
      method: req.method,
      path: req.path,
      origin,
      hasHeader,
      requestId: res.locals.requestId,
    });
    res.status(403).json({
      success: false,
      code: "CSRF_REJECTED",
      message: "This request couldn't be verified. Please refresh the page and try again.",
      requestId: res.locals.requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
