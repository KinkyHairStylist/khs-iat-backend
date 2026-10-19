import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { CURRENCY } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { createPaymentIntent, refundPaymentIntent, retrievePaymentIntent } from "../../lib/stripe";
import { notifySlack } from "../../lib/slack";
import { getServiceLogger } from "../../utils/loggerCreator";
import { bookingPaymentRow, creditSalonWallet, LEDGER_CURRENCY } from "../bookings/ledger";
import { getPaymentSettings } from "../bookings/paymentSettings";
import { fromCents, MIN_CARD_CHARGE_CENTS } from "../bookings/paymentQuote";
import type { GiftCardRecipient } from "../../schemas/bookings.schema";
import { announceGiftCardSale } from "./giftCardSaleAnnouncements";

const logger = getServiceLogger("gift-card-sales");

// Buying one of a salon's gift cards. A card for sale is salon stock; buying
// it makes the buyer its owner and pays the salon its value at once (KHS takes
// its booking fees when the card is spent). The code is the card's secret, so
// it's only ever shown to the buyer.

// While someone is paying for a card, nobody else can start buying it.
const HOLD_SECONDS = 30 * 60;
const holdKey = (giftCardId: string) => `customer-giftcard-hold:${giftCardId}`;

/** Starts buying a card: a card payment for its value plus KHS's fee. The buyer holds the card for 30 minutes. */
export async function startGiftCardPurchase(userId: string, giftCardId: string, recipient: GiftCardRecipient = {}) {
  const card = await prisma.business_gift_cards.findFirst({
    where: { id: giftCardId, businesses: { status: "approved" } },
    select: { id: true, title: true, amount: true, soldStatus: true, status: true, businessId: true, businesses: { select: { owner_id: true } } },
  });
  if (!card) throw AppError.notFound("Gift card");
  if (card.soldStatus !== "available" || card.status !== "Active") throw AppError.conflict("This gift card has already been bought.", "GIFT_CARD_SOLD");

  const held = await redis.set(holdKey(card.id), userId, "EX", HOLD_SECONDS, "NX");
  if (!held && (await redis.get(holdKey(card.id))) !== userId) {
    throw AppError.conflict("Someone else is buying this gift card right now. Please pick another one.", "GIFT_CARD_HELD");
  }

  const { giftCardFeeRate } = await getPaymentSettings();
  const valueCents = Math.round(Number(card.amount.toString()) * 100);
  const feeCents = Math.round((valueCents * giftCardFeeRate) / 100);
  const totalCents = valueCents + feeCents;
  if (totalCents < MIN_CARD_CHARGE_CENTS) throw AppError.badRequest("This gift card is too small to pay by card.");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true } });
  const intent = await createPaymentIntent({
    amountCents: totalCents,
    currency: CURRENCY,
    email: user.email,
    // Who it's for rides on the payment, so completing it needs nothing more from the browser.
    metadata: {
      kind: "gift_card", giftCardId: card.id, purchaserId: userId, valueCents: String(valueCents), feeCents: String(feeCents),
      ...Object.fromEntries(Object.entries(recipient).filter(([, v]) => v)),
    },
  });
  if (!intent.client_secret) throw AppError.internal();

  const party = { customerId: userId, ownerId: card.businesses.owner_id, customerName: `${user.firstName ?? ""} ${user.surname ?? ""}`.trim() };
  await prisma.transactions.createMany({
    data: [
      { ...bookingPaymentRow(party, { amountCents: valueCents, method: "Stripe", description: `Purchase of gift card "${card.title}"`, referenceId: intent.id, completed: false }), service: "GiftCard-Purchase" },
      // KHS's fee, paid by the buyer on top of the card's value.
      ...(feeCents > 0
        ? [{
            senderId: userId, amount: fromCents(feeCents), type: "Fee" as const, currency: LEDGER_CURRENCY, mode: "Web",
            description: `Platform fee for gift card "${card.title}" purchase`, referenceId: intent.id, status: "pending" as const,
            method: "Stripe" as const, service: "GiftCard-Fee", customerName: party.customerName,
          }]
        : []),
    ],
  });

  return { giftCardAmount: fromCents(valueCents), platformFee: fromCents(feeCents), totalAmount: fromCents(totalCents), clientSecret: intent.client_secret, reference: intent.id };
}

/**
 * After the card form accepted the payment: makes the buyer the card's owner
 * and pays the salon. Safe to call again. If the card was sold to someone else
 * meanwhile (e.g. on the old site), the payment is refunded.
 */
export async function completeGiftCardPurchase(userId: string, reference: string) {
  const intent = await retrievePaymentIntent(reference);
  if (intent.metadata?.kind !== "gift_card" || intent.metadata.purchaserId !== userId) throw AppError.notFound("Payment");
  if (intent.status !== "succeeded") throw AppError.badRequest("Your payment hasn't gone through yet. Please try again in a moment.", "PAYMENT_NOT_COMPLETE");

  const giftCardId = intent.metadata.giftCardId;
  const valueCents = Number(intent.metadata.valueCents) || 0;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true } });
  const buyerName = `${user.firstName ?? ""} ${user.surname ?? ""}`.trim() || "Valued Customer";
  const meta = intent.metadata;
  const recipient = {
    name: meta.recipientName || buyerName,
    email: meta.recipientEmail || user.email,
    senderName: meta.senderName || buyerName,
    message: meta.message || null,
  };

  const outcome = await prisma.$transaction(async (tx) => {
    const [card] = await tx.$queryRaw<Array<{ id: string; soldStatus: string; ownerId: string | null; expiryInDays: number; businessId: string; ownerOfSalon: string }>>`
      SELECT g.id, g."soldStatus"::text AS "soldStatus", g."ownerId"::text AS "ownerId", g."expiryInDays", g."businessId"::text AS "businessId",
             b.owner_id::text AS "ownerOfSalon"
      FROM business_gift_cards g JOIN businesses b ON b.id = g."businessId"
      WHERE g.id = ${giftCardId}::uuid FOR UPDATE OF g`;
    if (!card) return { kind: "missing" as const };

    if (card.soldStatus === "purchased") {
      const ours = await tx.transactions.findFirst({ where: { referenceId: reference, service: "GiftCard-Purchase", status: "completed" }, select: { id: true } });
      return ours ? { kind: "done" as const } : { kind: "sold-elsewhere" as const };
    }

    const expiresAt = new Date(Date.now() + (card.expiryInDays || 365) * 86_400_000);
    await tx.business_gift_cards.update({
      where: { id: card.id },
      data: {
        ownerId: userId, ownerEmail: user.email, ownerFullName: buyerName, soldStatus: "purchased", status: "Active",
        remainingAmount: fromCents(valueCents), recipientName: recipient.name, recipientEmail: recipient.email, senderName: recipient.senderName, message: recipient.message,
        currency: LEDGER_CURRENCY, expiresAt, updatedAt: new Date(),
      },
    });
    await tx.transactions.updateMany({ where: { referenceId: reference, service: { in: ["GiftCard-Purchase", "GiftCard-Fee"] } }, data: { status: "completed", updatedAt: new Date() } });
    // The salon is paid the card's full value now.
    await creditSalonWallet(tx, {
      businessId: card.businessId, ownerId: card.ownerOfSalon, amountCents: valueCents, senderId: userId,
      description: "Business Gift card purchase via Stripe", referenceId: reference, method: "Stripe",
    });
    return { kind: "sold" as const };
  }, MONEY_TX_OPTIONS);

  await redis.del(holdKey(giftCardId));

  if (outcome.kind === "missing" || outcome.kind === "sold-elsewhere") {
    await refundUnfulfilled(reference, giftCardId);
    throw AppError.conflict("Someone else bought this gift card just before you. Your payment has been refunded.", "GIFT_CARD_SOLD");
  }

  const card = await prisma.business_gift_cards.findUniqueOrThrow({
    where: { id: giftCardId },
    select: { id: true, code: true, title: true, businessId: true, remainingAmount: true, expiresAt: true, status: true },
  });
  if (outcome.kind === "sold") announceGiftCardSale({ cardId: card.id, buyerId: userId, buyerName, buyerEmail: user.email, valueCents, recipient });
  return { giftCard: { ...card, remainingAmount: card.remainingAmount.toString() }, alreadyCompleted: outcome.kind === "done" };
}

async function refundUnfulfilled(reference: string, giftCardId: string): Promise<void> {
  try {
    await refundPaymentIntent(reference, "gift card already sold");
    await prisma.transactions.updateMany({ where: { referenceId: reference, status: "pending" }, data: { status: "cancelled" } });
  } catch (err) {
    logger.error("Could not refund a gift card that was sold elsewhere", { reference, error: (err as Error).message });
    notifySlack({
      node: "Payment", severity: "CRITICAL", type: "ERROR_ALERT",
      trigger: `Gift card refund failed (${reference})`,
      body: `• A customer paid for gift card ${giftCardId}, which had already been sold, and the automatic refund failed.
        • Refund payment ${reference} by hand in Stripe.`,
    });
  }
}
