import { parseSchema } from "../../utils/parseSchema";
import { dashboardHomeQuerySchema, dashboardStatsQuerySchema } from "../../schemas/merchant/dashboard.schema";
import { getDashboardHome, getDashboardStats } from "../../services/merchant/dashboard/dashboardService";
import { getSubscriptionStatus } from "../../services/merchant/billing/subscriptionStatusService";
import { merchantHandler } from "./merchantHandler";

export const home = merchantHandler(async (req, res, userId) => {
  res.success(await getDashboardHome(userId, parseSchema(dashboardHomeQuerySchema, req.query).date));
});

export const stats = merchantHandler(async (req, res, userId) => {
  const { period, date } = parseSchema(dashboardStatsQuerySchema, req.query);
  res.success(await getDashboardStats(userId, period, date));
});

export const subscriptionStatus = merchantHandler(async (_req, res, userId) => {
  res.success(await getSubscriptionStatus(userId));
});
