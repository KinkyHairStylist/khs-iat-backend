import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { announceConfirmedBooking } from "./bookingAnnouncements";
import { creditSalonWallet, LEDGER_CURRENCY, payoutAvailableAt, type LedgerParty } from "./ledger";
import { getPaymentSettings } from "./paymentSettings";
import { confirmOrder, type OrderAppointment } from "./orderStore";
import { fromCents } from "./paymentQuote";

// Paying for a booking with a membership: one session per appointment. The
// customer paid for the sessions up front; the salon is paid now, per session,
// minus KHS's commission (the money waits 48 hours in its pending balance, as
// with the Kinky-Hair-Stylist backend).

export async function payWithMembership(input: {
  orderId: string; rows: OrderAppointment[]; membershipPurchaseId: string; party: LedgerParty;
}): Promise<{ sessionsUsed: number; remainingSessions: number }> {
  const { orderId, rows, party } = input;
  const businessId = rows[0].business_id!;
  const sessionsNeeded = rows.length;
  const { commissionRate } = await getPaymentSettings();

  const result = await prisma.$transaction(async (tx) => {
    // Locked, so two bookings can't use the same last session.
    const [purchase] = await tx.$queryRaw<Array<{ id: string; clientId: string; businessId: string; remainingSessions: number; status: string; expiresAt: Date; serviceId: string; pricePerSession: string }>>`
      SELECT mp.id, mp."clientId"::text AS "clientId", mp."businessId"::text AS "businessId", mp."remainingSessions",
             mp.status::text AS status, mp."expiresAt", p."serviceId"::text AS "serviceId", p."pricePerSession"::text AS "pricePerSession"
      FROM merchant_membership_purchases mp JOIN merchant_membership_packages p ON p.id = mp."packageId"
      WHERE mp.id = ${input.membershipPurchaseId}::uuid FOR UPDATE OF mp`;

    // Someone else's membership is "not found", so its existence isn't given away.
    if (!purchase || purchase.clientId !== party.customerId) throw AppError.notFound("Membership");
    if (purchase.status !== "ACTIVE") throw AppError.badRequest("This membership isn't active any more.", "MEMBERSHIP_UNUSABLE");
    if (purchase.expiresAt < new Date()) throw AppError.badRequest("This membership has expired.", "MEMBERSHIP_UNUSABLE");
    if (purchase.businessId !== businessId) throw AppError.badRequest("This membership is for a different salon.", "MEMBERSHIP_UNUSABLE");
    if (rows.some((r) => r.service_id !== purchase.serviceId)) {
      throw AppError.badRequest("This membership only covers a specific service, which isn't the one you're booking.", "MEMBERSHIP_UNUSABLE");
    }
    if (purchase.remainingSessions < sessionsNeeded) {
      throw AppError.badRequest(`Only ${purchase.remainingSessions} session(s) left on this membership — this booking needs ${sessionsNeeded}.`, "MEMBERSHIP_UNUSABLE");
    }

    const remaining = purchase.remainingSessions - sessionsNeeded;
    await tx.merchant_membership_purchases.update({
      where: { id: purchase.id },
      data: { remainingSessions: remaining, updatedAt: new Date(), ...(remaining === 0 ? { status: "FULLY_REDEEMED" } : {}) },
    });
    await confirmOrder(tx, orderId);

    const priceCents = Math.round(Number(purchase.pricePerSession) * 100);
    const totalCents = priceCents * sessionsNeeded;
    const commissionCents = Math.round((priceCents * commissionRate) / 100) * sessionsNeeded;
    const common = { currency: LEDGER_CURRENCY, mode: "Web", referenceId: orderId, status: "completed" as const, method: "Stripe" as const, customerName: party.customerName };
    await tx.transactions.createMany({
      data: [
        { ...common, senderId: party.customerId, recipientId: party.ownerId, amount: fromCents(totalCents), type: "Debit", description: `Membership session redemption for appointment order ${orderId}`, service: "Booking-MembershipRedemption" },
        ...(commissionCents > 0
          ? [{ ...common, senderId: party.ownerId, amount: fromCents(commissionCents), type: "Fee" as const, feeSubtype: "Commission", description: `Commission for membership redemption on order ${orderId}`, service: "Booking-Fee" }]
          : []),
      ],
    });
    if (totalCents - commissionCents > 0) {
      await creditSalonWallet(tx, {
        businessId, ownerId: party.ownerId, amountCents: totalCents - commissionCents, senderId: party.customerId,
        description: `Membership session redemption for order ${orderId}`, referenceId: orderId, method: "Stripe",
        availableAt: payoutAvailableAt(),
      });
    }
    return { remaining, totalCents };
  }, MONEY_TX_OPTIONS);

  void announceConfirmedBooking(orderId, {
    amountCents: result.totalCents,
    method: "Membership",
    merchantNote: `Paid with membership (${sessionsNeeded} ${sessionsNeeded === 1 ? "session" : "sessions"} used)`,
  });
  return { sessionsUsed: sessionsNeeded, remainingSessions: result.remaining };
}
