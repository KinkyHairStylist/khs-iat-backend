import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// Cards saved on the old site. Nothing charges them (card payments go through
// Stripe's form), so customers can only see and remove them here. The stored
// number and CVV never leave the server.

const SAFE_CARD_SELECT = {
  id: true, providerName: true, type: true, cardHolderName: true, lastFourDigits: true, expiryMonth: true, expiryYear: true,
  billingAddress: true, isDefault: true, createdAt: true,
} as const;

export function listCards(userId: string) {
  return prisma.card.findMany({ where: { userId }, select: SAFE_CARD_SELECT, orderBy: { createdAt: "desc" } });
}

/** Gift cards may point at the card they were bought with; that link is dropped first. */
async function deleteCards(tx: Prisma.TransactionClient, where: Prisma.cardWhereInput): Promise<number> {
  const ids = (await tx.card.findMany({ where, select: { id: true } })).map((c) => c.id);
  if (!ids.length) return 0;
  await tx.business_gift_cards.updateMany({ where: { cardId: { in: ids } }, data: { cardId: null } });
  await tx.gift_card.updateMany({ where: { cardId: { in: ids } }, data: { cardId: null } });
  const { count } = await tx.card.deleteMany({ where: { id: { in: ids } } });
  return count;
}

export async function deleteCard(userId: string, cardId: string) {
  await prisma.$transaction(async (tx) => {
    const card = await tx.card.findFirst({ where: { id: cardId, userId }, select: { isDefault: true } });
    if (!card) throw AppError.notFound("Card");
    await deleteCards(tx, { id: cardId });
    // Another card becomes the default, as before.
    if (card.isDefault) {
      const next = await tx.card.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (next) await tx.card.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

/** Every saved card of a customer (closing the account). */
export function deleteAllCards(tx: Prisma.TransactionClient, userId: string) {
  return deleteCards(tx, { userId });
}
