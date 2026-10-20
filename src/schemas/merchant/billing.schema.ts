import { z } from "zod";
import { PLAN_TIERS } from "../../utils/merchantPlans";

// The merchant's plan billing. A payment method id is what Stripe Elements
// returns after saving a card against the merchant's own customer.
const paymentMethodId = z.string().regex(/^pm_[A-Za-z0-9_]{3,250}$/, "That card couldn't be read. Please try again.");

export const subscribeSchema = z.object({
  tier: z.enum(PLAN_TIERS as [string, ...string[]], { error: "Choose a plan." }),
  paymentMethodId,
});

export const billingCardSchema = z.object({ paymentMethodId });
