import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { refundRequestedEmail, refundRequestTeamEmail } from "../../emails";
import { AppError } from "../../middlewares/centralAppError";
import { formatMoney } from "../../utils/money";
import { displayName } from "../auth/accountAccess";
import { findCustomerTransaction, REFUND_WINDOW_DAYS } from "./billingService";

/**
 * "Request refund" on a payment. The request is a pending refunds row with
 * nothing refunded yet (amount 0): the staff app adds the real amount when it
 * issues the refund, and a 0 never counts as money already returned. Card
 * payments are refunded to the card, so no bank details are collected.
 */
export async function requestRefund(userId: string, transactionId: string, reason: string) {
  const { row, view } = await findCustomerTransaction(userId, transactionId);
  if (row.type !== "Debit" || row.senderId !== userId) throw AppError.badRequest("Only a payment you made can be refunded.", "NOT_REFUNDABLE");
  if (view.refundRequested) throw AppError.conflict("You've already asked for a refund of this payment. We'll be in touch.", "REFUND_ALREADY_REQUESTED");
  if (view.status !== "paid") throw AppError.badRequest("This payment can't be refunded (it isn't complete or was already refunded).", "NOT_REFUNDABLE");
  if (!view.canRequestRefund) throw AppError.badRequest(`Refunds can only be requested within ${REFUND_WINDOW_DAYS} days of paying.`, "REFUND_WINDOW_PASSED");

  try {
    await prisma.refunds.create({
      data: {
        transactionId, userId, amount: 0, currency: (row.currency ?? "AUD").toUpperCase(), reason, status: "pending",
        adminNote: "Customer asked for a refund — not refunded yet",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("You've already asked for a refund of this payment. We'll be in touch.", "REFUND_ALREADY_REQUESTED");
    }
    throw err;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true } });
  const name = displayName(user);
  const amount = formatMoney(view.amount, view.currency);
  const reference = row.referenceId ?? row.id.slice(0, 8).toUpperCase();
  sendEmailInBackground({ to: user.email, ...refundRequestedEmail({ name: user.firstName || name, reference, amount, reason }) });
  if (DELIVERY_TEAM_EMAIL) {
    sendEmailInBackground({ to: DELIVERY_TEAM_EMAIL, ...refundRequestTeamEmail({ customer: name, email: user.email, reference, amount, description: row.description, reason }) });
  }
  notifySlack({
    node: "Payment",
    trigger: `Refund request from ${name}`,
    body: `• Payment: ${row.description}
      • Amount: ${amount} (ref ${reference})
      • Reason: ${reason}
      • Review it in the staff app → Payments`,
  });
  return findCustomerTransaction(userId, transactionId).then((r) => r.view);
}
