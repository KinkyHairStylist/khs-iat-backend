import { billingCardSchema, subscribeSchema } from "../../schemas/merchant/billing.schema";
import { parseSchema } from "../../utils/parseSchema";
import { startBillingCardSetup, subscribeToPlan, updateBillingCard } from "../../services/merchant/billing/billingService";
import type { PlanTier } from "../../utils/merchantPlans";
import { merchantHandler } from "./merchantHandler";

export const cardSetup = merchantHandler(async (_req, res, userId) => {
  res.success(await startBillingCardSetup(userId));
});

export const subscribe = merchantHandler(async (req, res, userId) => {
  const input = parseSchema(subscribeSchema, req.body);
  res.success(await subscribeToPlan(userId, { tier: input.tier as PlanTier, paymentMethodId: input.paymentMethodId }), "Plan started");
});

export const updateCard = merchantHandler(async (req, res, userId) => {
  res.success(await updateBillingCard(userId, parseSchema(billingCardSchema, req.body).paymentMethodId), "Card updated");
});
