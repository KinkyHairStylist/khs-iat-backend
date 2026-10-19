import { Request, Response } from "express";
import { AppError, catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { listSalonsSchema, salonIdSchema, salonsQuery } from "../../schemas/customer/salons.schema";
import * as salonsService from "../../services/customer/salonsService";
import { getSalonDetail } from "../../services/customer/salonDetailService";
import { getSalonReviews } from "../../services/customer/salonReviewsService";
import { getSimilarSalons } from "../../services/customer/similarSalonsService";

/** The salon id from the URL; one that can't be a real id is "not found". */
export function salonIdParam(req: Request): string {
  const parsed = salonIdSchema.safeParse(req.params);
  if (!parsed.success) throw AppError.notFound("Salon");
  return parsed.data.id;
}

export const listSalons = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(listSalonsSchema, salonsQuery(req.query as Record<string, unknown>));
  res.success(await salonsService.listSalons(input));
});

export const getServiceTypes = catchAsync(async (_req: Request, res: Response) => {
  res.success(salonsService.listServiceTypes());
});

export const getLocations = catchAsync(async (_req: Request, res: Response) => {
  res.success(await salonsService.listLocations());
});

export const getSalon = catchAsync(async (req: Request, res: Response) => {
  res.success(await getSalonDetail(salonIdParam(req)));
});

export const getReviews = catchAsync(async (req: Request, res: Response) => {
  res.success(await getSalonReviews(salonIdParam(req)));
});

export const getSimilar = catchAsync(async (req: Request, res: Response) => {
  res.success(await getSimilarSalons(salonIdParam(req)));
});
