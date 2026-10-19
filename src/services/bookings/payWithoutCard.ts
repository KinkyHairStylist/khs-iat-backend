import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { formatMoney } from "../../utils/money";
import { assertGiftCardSpendable } from "../customer/giftCardsService";
import { announceConfirmedBooking } from "./bookingAnnouncements";
import { bookingFees, bookingPaymentRow, claimAcquisition, debitSalonWallet, type LedgerParty } from "./ledger";
import { fromCents } from "./paymentQuote";
import { confirmOrder } from "./orderStore";

// Bookings confirmed without a card payment.

/** Nothing to pay: confirmed at once. No fees, no wallet movement, and it doesn't use up the customer's "first booking". */
export async function confirmFreeBooking(orderId: string): Promise<void> {
  await prisma.$transaction((tx) => confirmOrder(tx, orderId));
  void announceConfirmedBooking(orderId, { amountCents: 0, method: "Free booking", merchantNote: "Free booking, nothing to pay" });
}

/**
 * A gift card covers the whole booking. The salon was paid the card's value
 * when it sold it, so it isn't credited again — KHS's fees are taken from its
 * wallet instead. One transaction, with the card locked so two bookings can't
 * both spend the same balance.
 */
export async function payWithGiftCard(input: {
  orderId: string; code: string; businessId: string; planTier: string; party: LedgerParty; totalCents: number;
}): Promise<void> {
  const { orderId, party, totalCents } = input;

  await prisma.$transaction(async (tx) => {
    const [card] = await tx.$queryRaw<Array<{ id: string; code: string; businessId: string; remainingAmount: string; status: string; soldStatus: string; expiresAt: Date | null }>>`
      SELECT id, code, "businessId"::text AS "businessId", "remainingAmount"::text AS "remainingAmount",
             status::text AS status, "soldStatus"::text AS "soldStatus", "expiresAt"
      FROM business_gift_cards WHERE code = ${input.code} FOR UPDATE`;
    assertGiftCardSpendable(card ?? null, input.businessId);
    const balanceCents = Math.round(Number(card.remainingAmount) * 100);
    if (balanceCents < totalCents) {
      throw AppError.badRequest("This gift card no longer covers the whole booking. Please apply it again.", "GIFT_CARD_UNUSABLE");
    }

    const leftCents = balanceCents - totalCents;
    await tx.business_gift_cards.update({
      where: { id: card.id },
      data: { remainingAmount: fromCents(leftCents), updatedAt: new Date(), ...(leftCents === 0 ? { status: "Used", redeemedAt: new Date() } : {}) },
    });
    await confirmOrder(tx, orderId);
    await tx.transactions.createMany({
      data: [bookingPaymentRow(party, {
        amountCents: totalCents, method: "GiftCard", description: `Gift card payment for appointment order ${orderId}`,
        referenceId: orderId, completed: true,
      })],
    });

    // A gift card doesn't waive KHS's fees; they come out of the salon's wallet.
    const fees = await bookingFees(tx, { businessId: input.businessId, clientId: party.customerId, planTier: input.planTier, serviceTotalCents: totalCents });
    const acquisitionCents = fees.acquisitionCents > 0 && (await claimAcquisition(tx, input.businessId, party.customerId, orderId)) ? fees.acquisitionCents : 0;
    const debit = { businessId: input.businessId, ownerId: party.ownerId, orderId, customerName: party.customerName };
    if (acquisitionCents > 0) await debitSalonWallet(tx, { ...debit, amountCents: acquisitionCents, subtype: "Acquisition" });
    if (fees.commissionCents > 0) await debitSalonWallet(tx, { ...debit, amountCents: fees.commissionCents, subtype: "Commission" });
  }, MONEY_TX_OPTIONS);

  void announceConfirmedBooking(orderId, { amountCents: totalCents, method: "Gift card", merchantNote: `Paid ${formatMoney(fromCents(totalCents))} with a gift card` });
}
