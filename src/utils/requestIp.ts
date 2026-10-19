import { Request } from "express";
import { sanitizeLogValue } from "./loggerCreator";

/** Best-effort caller IP — respects Express's trust proxy setting via req.ip. */
export function getClientIp(req: Request): string {
  return sanitizeLogValue(req.ip ?? req.socket?.remoteAddress ?? "unknown", 64);
}
