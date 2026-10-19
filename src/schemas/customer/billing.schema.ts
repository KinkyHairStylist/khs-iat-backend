import { z } from "zod";

// Billing history: paging, the summary year and refund requests.

/** ?cursor=&limit= — the cursor is the last row's id from the previous page. */
export const transactionsQuerySchema = z.object({
  cursor: z.string().uuid().optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).catch(30),
});

export const summaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional().catch(undefined),
});

export const refundRequestSchema = z.object({
  reason: z
    .string({ error: "Please tell us why you'd like a refund." })
    .trim()
    .min(10, "Please tell us a little more about why you'd like a refund (at least 10 characters).")
    .max(1000, "Please keep the reason to 1000 characters or fewer."),
});
