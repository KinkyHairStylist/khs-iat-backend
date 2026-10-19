import { Request, Response, NextFunction } from "express";
import { isDbConnected } from "../lib/prisma/dbWatcher";

/**
 * Blocks any request with 503 when the database is not reachable.
 * Mount this after health-check routes so /health always responds.
 */
export function dbReady(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isDbConnected()) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    code: "SERVICE_UNAVAILABLE",
    message: "We're having trouble connecting right now. Please try again in a moment.",
    timestamp: new Date().toISOString(),
  });
}
