import { Request, Response } from "express";
import { z } from "zod";
import { AppError, catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { customerHandler } from "../customerHandler";
import { listActiveCustomerAlerts } from "../../services/customer/alertsService";
import * as favorites from "../../services/customer/favoritesService";
import { getPreferences } from "../../services/customer/preferencesService";
import { helpfulReviewIds, markReviewHelpful } from "../../services/customer/salonReviewsService";
import { reviewIdSchema } from "../../schemas/customer/salons.schema";
import { salonIdParam } from "./salonsController";
import { getDashboard } from "../../services/customer/dashboardService";
import { getReferralPage } from "../../services/customer/referralPageService";

const serviceIdSchema = z.object({ serviceId: z.string().uuid("We couldn't find that service. Please refresh and try again.") });

// ─── Public ───────────────────────────────────────────────────────────────────

export const activeAlerts = catchAsync(async (req: Request, res: Response) => {
  // ?audience=merchant for the merchant dashboard; customers by default.
  res.success(await listActiveCustomerAlerts(req.query.audience === "merchant" ? "merchant" : "customer"));
});

// ─── Signed-in customer ───────────────────────────────────────────────────────

export const favoriteIds = customerHandler(async (_req, res, userId) => {
  res.success(await favorites.listFavoriteServiceIds(userId));
});

export const addFavorite = customerHandler(async (req, res, userId) => {
  await favorites.addFavorite(userId, parseSchema(serviceIdSchema, req.body).serviceId);
  res.success(null, "Added to your favourites.");
});

export const removeFavorite = customerHandler(async (req, res, userId) => {
  await favorites.removeFavorite(userId, parseSchema(serviceIdSchema, req.params).serviceId);
  res.success(null, "Removed from your favourites.");
});

export const preferences = customerHandler(async (_req, res, userId) => {
  res.success(await getPreferences(userId));
});

export const markHelpful = customerHandler(async (req, res, userId) => {
  const parsed = reviewIdSchema.safeParse(req.params);
  if (!parsed.success) throw AppError.notFound("Review");
  res.success(await markReviewHelpful(userId, parsed.data.reviewId));
});

export const helpfulReviews = customerHandler(async (req, res, userId) => {
  res.success(await helpfulReviewIds(userId, salonIdParam(req)));
});

export const dashboard = customerHandler(async (_req, res, userId) => {
  res.success(await getDashboard(userId));
});

export const favoritesList = customerHandler(async (_req, res, userId) => {
  res.success(await favorites.listFavorites(userId));
});

export const referrals = customerHandler(async (_req, res, userId) => {
  res.success(await getReferralPage(userId));
});
