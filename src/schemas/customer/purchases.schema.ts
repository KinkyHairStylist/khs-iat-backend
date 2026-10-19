import { z } from "zod";

// The gift card and membership shops' query values.

export const shopQuerySchema = z.object({
  businessId: z.string().uuid("We couldn't find that salon.").optional(),
});
