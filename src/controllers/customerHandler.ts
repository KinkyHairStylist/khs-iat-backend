import { Request, Response } from "express";
import { AppError, catchAsync } from "../middlewares/centralAppError";

/**
 * A handler for a route behind `authenticate`: passes the signed-in
 * customer's id, so no handler can forget to scope its query to them.
 */
export function customerHandler(fn: (req: Request, res: Response, userId: string) => Promise<unknown>) {
  return catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    await fn(req, res, req.user.sub);
  });
}
