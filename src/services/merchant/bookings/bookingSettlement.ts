import { Prisma } from "../../../generated/prisma/client";
import { creditSalonWallet, debitSalonWallet, payoutAvailableAt } from "../../bookings/ledger";

// Paying the salon for a booking that's over (completed, or the client didn't
// turn up). The card payment KHS has been holding is released: the salon is
// credited the booking amount minus KHS's acquisition fee and commission, into
// its pending balance for 48 hours. When a gift card paid most of the booking
// the fees can be more than the card payment; what's left is taken from the
// salon's wallet. Runs inside the same transaction as the status change, so a
// booking is never marked done without its payout (the old code paid out
// afterwards, and a failure left the salon unpaid with nothing retrying it).

type Tx = Prisma.TransactionClient;

interface HeldPayment {
  stripePaymentIntentId: string;
  bookingAmount: string;
  acquisitionFeeAmount: string;
  commissionFeeAmount: string;
  userId: string;
  businessId: string;
}

export interface StaffOnBooking {
  id: string;
  commissionRate: Prisma.Decimal | null;
}

const cents = (value: string | number) => Math.round(Number(value) * 100);

/** Claims the order's held card payments as released, so they're paid out exactly once. */
async function claimForRelease(tx: Tx, orderId: string): Promise<HeldPayment[]> {
  return tx.$queryRaw<HeldPayment[]>`
    UPDATE stripe_payment_intents SET status = 'released', "releasedAt" = NOW(), "updatedAt" = NOW()
    WHERE "orderId" = ${orderId} AND status = 'held'
    RETURNING "stripePaymentIntentId", "bookingAmount"::text AS "bookingAmount", "acquisitionFeeAmount"::text AS "acquisitionFeeAmount",
              "commissionFeeAmount"::text AS "commissionFeeAmount", "userId"::text AS "userId", "businessId"::text AS "businessId"`;
}

/**
 * Releases the order's held payments to the salon. Returns what was credited
 * (in cents), 0 when nothing was held (cash, gift card or membership bookings).
 */
export async function releaseHeldPayments(tx: Tx, input: {
  orderId: string; ownerId: string; customerName: string; staff: StaffOnBooking[];
}): Promise<number> {
  const payments = await claimForRelease(tx, input.orderId);
  let creditedCents = 0;

  for (const p of payments) {
    const acquisition = cents(p.acquisitionFeeAmount);
    const commission = cents(p.commissionFeeAmount);
    const net = cents(p.bookingAmount) - acquisition - commission;

    if (net > 0) {
      await creditSalonWallet(tx, {
        businessId: p.businessId, ownerId: input.ownerId, amountCents: net, senderId: p.userId,
        description: `Escrow release for completed booking ${input.orderId}`, referenceId: p.stripePaymentIntentId,
        method: "Stripe", availableAt: payoutAvailableAt(),
      });
      creditedCents += net;
    } else if (net < 0) {
      // The fees in proportion, so each is recorded as its own kind.
      const shortfall = -net;
      const fees = acquisition + commission;
      const acquisitionShare = fees > 0 ? Math.round((shortfall * acquisition) / fees) : 0;
      const debit = { businessId: p.businessId, ownerId: input.ownerId, orderId: input.orderId, customerName: input.customerName };
      if (acquisitionShare > 0) await debitSalonWallet(tx, { ...debit, amountCents: acquisitionShare, subtype: "Acquisition" });
      if (shortfall - acquisitionShare > 0) await debitSalonWallet(tx, { ...debit, amountCents: shortfall - acquisitionShare, subtype: "Commission" });
    }
  }

  if (creditedCents > 0) await recordStaffCommissions(tx, input.orderId, payments[0].businessId, creditedCents, input.staff);
  return creditedCents;
}

/**
 * What each assigned team member earned on the payout, at their commission
 * rate. Informational (staff have no wallets), recorded once per order.
 */
async function recordStaffCommissions(tx: Tx, orderId: string, businessId: string, netCents: number, staff: StaffOnBooking[]) {
  const rows = staff
    .map((s) => ({ s, rate: Number(s.commissionRate ?? 0) }))
    .filter(({ rate }) => rate > 0 && rate <= 100)
    .map(({ s, rate }) => ({
      staffId: s.id, businessId, orderId, netAmount: netCents / 100, commissionRate: rate,
      commissionAmount: Math.round((netCents * rate) / 100) / 100,
    }));
  if (rows.length > 0) await tx.staff_commission_earnings.createMany({ data: rows });
}
