import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// Gift cards a customer can spend on a booking. A card can only be spent at
// the salon that sold it (that salon was paid for it).

export interface SpendableGiftCard {
  id: string;
  code: string;
  businessId: string;
  remainingAmount: { toString(): string };
  status: string;
  soldStatus: string;
  expiresAt: Date | null;
}

type Refusal = { reason: string; reasonCode?: "wrong_salon" };

/** Why this card can't be spent at `businessId`, or null when it can. */
export function giftCardRefusal(card: SpendableGiftCard | null, businessId?: string, now = new Date()): Refusal | null {
  if (!card) return { reason: "Gift card not found" };
  if (card.soldStatus !== "purchased") return { reason: "Gift card not purchased" };
  if (card.status !== "Active") return { reason: "Gift card is not active" };
  if (card.expiresAt && card.expiresAt < now) return { reason: "Gift card expired" };
  if (Number(card.remainingAmount.toString()) <= 0) return { reason: "Gift card already redeemed" };
  if (businessId && card.businessId !== businessId) return { reason: "Gift card is for a different salon", reasonCode: "wrong_salon" };
  return null;
}

/** Throws (400) unless the card can be spent at this salon. */
export function assertGiftCardSpendable(card: SpendableGiftCard | null, businessId: string): asserts card is SpendableGiftCard {
  const refusal = giftCardRefusal(card, businessId);
  if (refusal) {
    throw AppError.badRequest(
      refusal.reasonCode === "wrong_salon" ? "This gift card can only be used at the salon that issued it." : `${refusal.reason}.`,
      "GIFT_CARD_UNUSABLE",
    );
  }
}

const SPENDABLE_SELECT = { id: true, code: true, businessId: true, remainingAmount: true, status: true, soldStatus: true, expiresAt: true } as const;

export function findGiftCard(code: string) {
  return prisma.business_gift_cards.findUnique({ where: { code }, select: SPENDABLE_SELECT });
}

/** The "Validate" button on the payment page: whether the code can be spent (at this salon), and its balance. */
export async function validateGiftCard(code: string, businessId?: string) {
  const card = await findGiftCard(code);
  if (!card) throw AppError.notFound("Gift card");
  const refusal = giftCardRefusal(card, businessId);
  if (refusal) return { valid: false as const, ...refusal };
  return { valid: true as const, amount: card.remainingAmount.toString(), expiresAt: card.expiresAt, status: card.status };
}

/** Gift cards the customer bought (or was given and claimed), newest first. */
export async function listOwnedGiftCards(userId: string) {
  return prisma.business_gift_cards.findMany({
    where: { ownerId: userId, soldStatus: "purchased" },
    select: {
      id: true, title: true, code: true, businessId: true, amount: true, remainingAmount: true, status: true, expiresAt: true,
      currency: true, recipientName: true, senderName: true, message: true, template: true, createdAt: true,
      businesses: { select: { id: true, businessName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
