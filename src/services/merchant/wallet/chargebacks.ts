import prisma, { MONEY_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { notifySlack } from "../../../lib/slack";
import { formatMoney } from "../../../utils/money";
import { chargeSalonWallet } from "../../bookings/ledger";
import { getPaymentSettings } from "../../bookings/paymentSettings";

// Card disputes on booking payments (Stripe's charge.dispute.* webhooks). A lost
// dispute is recovered from the salon that was paid for the booking: the
// disputed amount plus the chargeback fee (admin > Payments, default 15).
// Recorded against the dispute's id, so a redelivered event can't take it twice.

export interface DisputeFacts {
  id: string;
  chargeId: string;
  amountCents: number;
  reason?: string | null;
  status?: string;
}

const bookingPaymentFor = (chargeId: string) =>
  prisma.stripe_payment_intents.findFirst({
    where: { stripeChargeId: chargeId },
    select: { orderId: true, businessId: true, stripePaymentIntentId: true, status: true },
  });

/** charge.dispute.created: the earliest warning, so KHS can act before money moves. */
export function announceDisputeOpened(d: DisputeFacts): void {
  notifySlack({
    node: "Payment",
    severity: "ERROR",
    type: "PAYMENT_FAILURE",
    trigger: `Stripe dispute opened for charge ${d.chargeId}`,
    body: `• A customer disputed a card payment. If it's lost, the salon's wallet is debited the amount plus the chargeback fee.\n• Amount: ${formatMoney(d.amountCents / 100)}\n• Reason: ${d.reason || "not given"}\n• Dispute: ${d.id}`,
  });
}

/** charge.dispute.closed. Only a lost dispute takes anything from the salon. */
export async function settleClosedDispute(d: DisputeFacts): Promise<void> {
  if (d.status !== "lost") {
    notifySlack({ node: "Payment", type: "PAYMENT_SUCCESS", trigger: `Stripe dispute closed (${d.status}) for charge ${d.chargeId}`, body: `• Nothing was taken from the salon.\n• Dispute: ${d.id}` });
    return;
  }

  const payment = await bookingPaymentFor(d.chargeId);
  if (!payment) {
    notifySlack({
      node: "Payment", severity: "ERROR", type: "ERROR_ALERT",
      trigger: `Chargeback for charge ${d.chargeId}`,
      body: `• A dispute was lost, but the charge isn't a booking payment, so ${formatMoney(d.amountCents / 100)} couldn't be recovered from a salon.\n• Dispute: ${d.id}`,
    });
    return;
  }
  // The salon is only paid when the appointment is completed: until then there's nothing of theirs to take back.
  if (payment.status !== "released") {
    notifySlack({
      node: "Payment", severity: "CRITICAL", type: "ERROR_ALERT",
      trigger: `Chargeback on an unpaid booking (${payment.orderId})`,
      body: `• A dispute was lost on order ${payment.orderId} while its payment is "${payment.status}", so the salon hasn't been paid for it.\n• Stop this booking's payout to the salon (cancel it) by hand.\n• Amount: ${formatMoney(d.amountCents / 100)}\n• Dispute: ${d.id}`,
    });
    return;
  }

  const { chargebackFee } = await getPaymentSettings();
  const feeCents = Math.round(chargebackFee * 100);
  const recovered = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispute:${d.id}`}))`;
    const done = await tx.transactions.findFirst({ where: { referenceId: d.id, service: "Chargeback" }, select: { id: true } });
    if (done) return false;
    const business = await tx.businesses.findUniqueOrThrow({ where: { id: payment.businessId }, select: { owner_id: true } });
    const common = { businessId: payment.businessId, ownerId: business.owner_id, referenceId: d.id };
    await chargeSalonWallet(tx, { ...common, amountCents: d.amountCents, type: "Debit", service: "Chargeback", description: `Chargeback recovered for order ${payment.orderId}` });
    if (feeCents > 0) {
      await chargeSalonWallet(tx, { ...common, amountCents: feeCents, type: "Fee", feeSubtype: "ChargebackFee", service: "Chargeback-Fee", description: `Chargeback fee for order ${payment.orderId}` });
    }
    return true;
  }, MONEY_TX_OPTIONS);

  if (recovered) {
    notifySlack({
      node: "Payment", severity: "CRITICAL", type: "PAYMENT_FAILURE",
      trigger: `Chargeback for charge ${d.chargeId}`,
      body: `• A dispute was lost: ${formatMoney(d.amountCents / 100)} plus a ${formatMoney(chargebackFee)} chargeback fee were taken from the salon's wallet.\n• Order: ${payment.orderId}\n• Business: ${payment.businessId}\n• Dispute: ${d.id}`,
    });
  }
}
