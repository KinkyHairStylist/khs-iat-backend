import prisma from "../../lib/prisma/prisma";
import { CURRENCY } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { createPaymentIntent } from "../../lib/stripe";
import { formatMoney } from "../../utils/money";
import { cancelUnpaidAttempts } from "./cardPaymentSettle";
import { bookingFeeRow, bookingFees, bookingPaymentRow, type LedgerParty } from "./ledger";
import { fromCents, MIN_CARD_CHARGE_CENTS, type PaymentQuote } from "./paymentQuote";

// Starting a card payment for a booking: a Stripe payment the browser
// completes with Stripe Elements, with its money recorded as pending until
// Stripe reports it paid (cardPaymentSettle). KHS holds the money; the salon
// is paid when the appointment is completed.

export async function startCardPayment(input: {
  orderId: string;
  businessId: string;
  planTier: string;
  party: LedgerParty;
  email: string | null;
  quote: PaymentQuote;
  depositOnly: boolean;
  giftCardCode: string | null;
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { orderId, quote, party } = input;
  if (quote.cardChargeCents < MIN_CARD_CHARGE_CENTS) {
    throw AppError.badRequest(`Card payments have a minimum of ${formatMoney(fromCents(MIN_CARD_CHARGE_CENTS))}. This booking is too small to pay by card.`);
  }

  // A new attempt replaces the order's earlier unpaid ones (a reload, or a change of deposit or gift card).
  await cancelUnpaidAttempts(orderId);

  // The acquisition fee is only worked out here; it's claimed once the payment goes through.
  const fees = await bookingFees(prisma, {
    businessId: input.businessId, clientId: party.customerId, planTier: input.planTier, serviceTotalCents: quote.serviceTotalCents,
  });

  const intent = await createPaymentIntent({
    amountCents: quote.cardChargeCents,
    currency: CURRENCY,
    email: input.email,
    metadata: {
      orderId,
      userId: party.customerId,
      businessId: input.businessId,
      bookingAmount: fromCents(quote.serviceTotalCents).toFixed(2),
      stripePassthroughAmount: fromCents(quote.processingFeeCents).toFixed(2),
      isDeposit: String(input.depositOnly),
      // Taken off the gift card once the card payment goes through.
      giftCardCode: input.giftCardCode ?? "",
      giftCardCents: String(quote.giftCardAppliedCents),
    },
  });
  if (!intent.client_secret) throw AppError.internal();

  const ref = intent.id;
  const rows = [
    ...(quote.giftCardAppliedCents > 0
      ? [bookingPaymentRow(party, { amountCents: quote.giftCardAppliedCents, method: "GiftCard", description: `Gift card portion for appointment order ${orderId}`, referenceId: ref, completed: false })]
      : []),
    bookingPaymentRow(party, {
      amountCents: quote.cardBaseCents, method: "Stripe", referenceId: ref, completed: false,
      description: input.depositOnly ? `50% deposit (Stripe) for appointment order ${orderId}` : `Card payment (Stripe) for appointment order ${orderId}`,
    }),
    ...(fees.acquisitionCents > 0
      ? [bookingFeeRow(party, { amountCents: fees.acquisitionCents, subtype: "Acquisition", method: "Stripe", description: `Acquisition fee for appointment order ${orderId}`, referenceId: ref, completed: false })]
      : []),
    ...(fees.commissionCents > 0
      ? [bookingFeeRow(party, { amountCents: fees.commissionCents, subtype: "Commission", method: "Stripe", description: `Commission for appointment order ${orderId}`, referenceId: ref, completed: false })]
      : []),
    ...(quote.processingFeeCents > 0
      ? [bookingFeeRow(party, { amountCents: quote.processingFeeCents, subtype: "StripePassthrough", method: "Stripe", description: `Stripe processing fee passthrough for appointment order ${orderId}`, referenceId: ref, completed: false })]
      : []),
  ];

  await prisma.$transaction([
    prisma.stripe_payment_intents.create({
      data: {
        orderId,
        businessId: input.businessId,
        userId: party.customerId,
        stripePaymentIntentId: ref,
        amount: fromCents(quote.cardChargeCents),
        currency: CURRENCY.toLowerCase(),
        // The part of the service price on the card (the deposit, or what the gift card didn't cover).
        bookingAmount: fromCents(quote.cardBaseCents),
        acquisitionFeeAmount: fromCents(fees.acquisitionCents),
        commissionFeeAmount: fromCents(fees.commissionCents),
        stripePassthroughFeeAmount: fromCents(quote.processingFeeCents),
        isDeposit: input.depositOnly,
        status: "pending",
      },
    }),
    prisma.transactions.createMany({ data: rows }),
  ]);

  return { clientSecret: intent.client_secret, paymentIntentId: ref };
}
