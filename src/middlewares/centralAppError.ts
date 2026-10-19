import { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { getServiceLogger } from "../utils/loggerCreator";
import { NODE_ENV } from "../config/env";

const logger = getServiceLogger("error-handler");

// ─── Augment Express types ────────────────────────────────────────────────────
// Read by activityLogger.ts so the activity trail records *why* a request failed.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required TS idiom for augmenting Express types
  namespace Express {
    interface Locals {
      errorCode?: string;
      errorMessage?: string;
    }
  }
}

// ─── Operational error class ──────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    isOperational = true
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = "BAD_REQUEST"): AppError {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = "Please log in to continue.", code = "UNAUTHORIZED"): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message = "You don't have permission to do this.", code = "FORBIDDEN"): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(resource = "Resource"): AppError {
    return new AppError(`We couldn't find this ${resource.toLowerCase()}. It may have been removed.`, 404, "NOT_FOUND");
  }

  static conflict(message: string, code = "CONFLICT"): AppError {
    return new AppError(message, 409, code);
  }

  static internal(message = "Something went wrong on our side. Please try again in a moment."): AppError {
    return new AppError(message, 500, "INTERNAL_ERROR", false);
  }
}

// ─── Prisma error translator ──────────────────────────────────────────────────

function fromPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case "P2002": {
      const fields = (err.meta?.target as string[] | undefined) ?? [];
      if (fields.includes("email")) {
        return AppError.conflict("An account with this email already exists.", "DUPLICATE_EMAIL");
      }
      if (fields.includes("phone")) {
        return AppError.conflict("This phone number is already in use by another account.", "DUPLICATE_PHONE");
      }
      return AppError.conflict("This already exists. Please use a different value.", "DUPLICATE");
    }
    case "P2025":
      return new AppError("We couldn't find what you're looking for. It may have been removed.", 404, "NOT_FOUND");
    case "P2003":
      return AppError.badRequest("Something this request refers to doesn't exist. Please check and try again.", "FOREIGN_KEY_ERROR");
    case "P2014":
      return AppError.badRequest("This change isn't allowed because other records depend on it.", "INVALID_RELATION");
    case "P2016":
      return AppError.badRequest("We couldn't process this request. Please check your details and try again.", "QUERY_ERROR");
    default:
      return new AppError("We couldn't complete this right now. Please try again in a moment.", 500, "DB_ERROR", false);
  }
}

// ─── Response senders ─────────────────────────────────────────────────────────

function sendError(err: AppError, req: Request, res: Response): void {
  res.locals.errorCode = err.code;
  res.locals.errorMessage = err.message;

  const body: Record<string, unknown> = {
    success: false,
    code: err.code,
    message: err.message,
    requestId: res.locals.requestId,
    timestamp: new Date().toISOString(),
  };

  if (NODE_ENV !== "production") {
    body.stack = err.stack;
  }

  res.status(err.statusCode).json(body);
}

// ─── Central error handler (must be registered last in app.ts) ───────────────

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = fromPrismaError(err);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    error = AppError.badRequest("Some of the details you entered aren't valid. Please check and try again.", "VALIDATION_ERROR");
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    error = new AppError("We're having trouble connecting right now. Please try again shortly.", 503, "DB_UNAVAILABLE", false);
  } else if ((err as { type?: string }).type === "entity.too.large") {
    error = new AppError("That's more than we can accept in one go. Please shorten it and try again.", 413, "PAYLOAD_TOO_LARGE");
  } else if (err instanceof SyntaxError && "body" in err) {
    // Malformed JSON body from express.json()
    error = AppError.badRequest("We couldn't read your request. Please check your details and try again.", "INVALID_JSON");
  } else if (err.name === "JsonWebTokenError") {
    error = AppError.unauthorized("Your session is invalid. Please log in again.", "INVALID_TOKEN");
  } else if (err.name === "TokenExpiredError") {
    error = AppError.unauthorized("Your session has expired. Please log in again.", "TOKEN_EXPIRED");
  } else if (err.name === "NotBeforeError") {
    error = AppError.unauthorized("Your session isn't active yet. Please log in again.", "TOKEN_NOT_ACTIVE");
  } else {
    // Unknown programming error — masked in production; its details are logged below.
    error = new AppError(
      NODE_ENV === "production" ? "Something went wrong on our side. Please try again in a moment." : err.message,
      500,
      "INTERNAL_ERROR",
      false
    );
  }

  const logMeta: Record<string, unknown> = {
    code: error.code,
    statusCode: error.statusCode,
    method: req.method,
    path: req.path,
    requestId: res.locals.requestId,
  };

  // The user sees the friendly message; the log keeps what actually went wrong
  // (Prisma code and fields, the raw message, the stack) for anything that
  // wasn't already a deliberate AppError.
  if (!(err instanceof AppError)) {
    logMeta.cause = {
      name: err.name,
      message: err.message,
      ...(err instanceof Prisma.PrismaClientKnownRequestError ? { prismaCode: err.code, meta: err.meta } : {}),
    };
    if (error.statusCode >= 500) logMeta.stack = err.stack;
  }

  if (error.statusCode >= 500) {
    logger.error(error.message, logMeta);
  } else if (error.statusCode >= 400) {
    logger.warn(error.message, logMeta);
  }

  sendError(error, req, res);
}

// ─── Async route wrapper — eliminates try/catch boilerplate in controllers ────

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export function catchAsync(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
