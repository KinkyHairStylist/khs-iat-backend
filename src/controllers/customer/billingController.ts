import { idParamSchema } from "../../schemas/fields";
import { refundRequestSchema, summaryQuerySchema, transactionsQuerySchema } from "../../schemas/customer/billing.schema";
import { parseSchema } from "../../utils/parseSchema";
import { customerHandler } from "../customerHandler";
import { getSummary, listTransactions } from "../../services/customer/billingService";
import { requestRefund } from "../../services/customer/refundRequestService";

// Billing history: payments, the year's totals and refund requests.

export const transactions = customerHandler(async (req, res, userId) => {
  res.success(await listTransactions(userId, parseSchema(transactionsQuerySchema, req.query)));
});

export const summary = customerHandler(async (req, res, userId) => {
  res.success(await getSummary(userId, parseSchema(summaryQuerySchema, req.query).year));
});

export const refundRequest = customerHandler(async (req, res, userId) => {
  const { id } = parseSchema(idParamSchema, req.params);
  const { reason } = parseSchema(refundRequestSchema, req.body);
  res.success(await requestRefund(userId, id, reason), "Refund request sent. We'll review it within 3–5 business days.");
});
