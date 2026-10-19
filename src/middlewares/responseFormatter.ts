import { Request, Response, NextFunction } from "express";

// ─── Standard response envelope ───────────────────────────────────────────────

export interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  timestamp: string;
  requestId: string | undefined;
}

export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  timestamp: string;
  requestId: string | undefined;
}

// ─── Augment Express types ────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required TS idiom for augmenting Express types
  namespace Express {
    interface Response {
      success<T>(data: T, message?: string, statusCode?: number): this;
      fail(message: string, statusCode?: number, code?: string): this;
    }
    interface Locals {
      requestId?: string;
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function responseFormatter(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.success = function <T>(
    data: T,
    message = "Success",
    statusCode = 200
  ): Response {
    const body: SuccessResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      requestId: this.locals.requestId,
    };
    return this.status(statusCode).json(body);
  };

  res.fail = function (
    message: string,
    statusCode = 400,
    code = "BAD_REQUEST"
  ): Response {
    const body: ErrorResponse = {
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.locals.requestId,
    };
    return this.status(statusCode).json(body);
  };

  next();
}
