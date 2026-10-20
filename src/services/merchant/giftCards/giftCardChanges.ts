import { randomInt } from "node:crypto";
import prisma from "../../../lib/prisma/prisma";
import redis from "../../../lib/redis/redis";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import type { GiftCardInput } from "../../../schemas/merchant/giftCards.schema";
import { LEDGER_CURRENCY } from "../../bookings/ledger";
import { holdKey } from "../../customer/giftCardSalesService";
import { requireMerchantBusiness } from "../merchantBusiness";
import { EDIT_WINDOW_HOURS, giftCardView, ownGiftCard, type GiftCardView } from "./giftCardQueries";

// Creating and managing a salon's gift cards. A card a customer has bought
// holds their money (the salon was paid its full value), so once sold its
// value, expiry and code never change, it can't be deleted, and stopping it is
// left to KHS. Status only changes through deactivate / reactivate, never by
// editing.

// KSH + 5 characters without I/O/0/1 (easy to misread when read out at the counter).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => `KSH${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** Refuses while a customer is paying for the card (their checkout holds it for a few minutes). */
async function assertNotInCheckout(id: string): Promise<void> {
  if (await redis.exists(holdKey(id))) throw AppError.conflict("Someone is buying this gift card right now. Try again in a few minutes.", "GIFT_CARD_BUSY");
}

const fields = (input: GiftCardInput) => ({
  template: input.template,
  title: input.title,
  description: input.description || null,
  message: input.message || null,
  amount: input.amount,
  benefits: input.benefits.join(","),
  expiryInDays: input.expiryInDays,
  // A listing's own expiry; a buyer's card gets a fresh one from the day it's bought.
  expiresAt: new Date(Date.now() + input.expiryInDays * 86_400_000),
});

export async function createGiftCard(userId: string, input: GiftCardInput): Promise<GiftCardView> {
  const business = await requireMerchantBusiness(userId);
  // The code column is unique across every salon; a clash is retried with a new code.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const card = await prisma.business_gift_cards.create({
        data: {
          ...fields(input), businessId: business.id, code: newCode(), currency: LEDGER_CURRENCY, status: "Active", soldStatus: "available",
          sentStatus: "pending", remainingAmount: 0, recipientName: "", recipientEmail: "",
        },
      });
      return giftCardView(card, business.businessName);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw AppError.internal("We couldn't create this gift card. Please try again.");
}

export async function updateGiftCard(userId: string, id: string, input: GiftCardInput): Promise<GiftCardView> {
  const business = await requireMerchantBusiness(userId);
  const card = await ownGiftCard(business.id, id);
  if (card.soldStatus === "purchased") throw AppError.conflict("This gift card has been bought, so it can't be changed.", "GIFT_CARD_SOLD");
  if (card.status !== "Active") throw AppError.conflict("Reactivate this gift card before changing it.", "GIFT_CARD_INACTIVE");
  if (Date.now() - card.createdAt.getTime() > EDIT_WINDOW_HOURS * 3_600_000) {
    throw AppError.conflict(`A gift card can only be changed within ${EDIT_WINDOW_HOURS} hours of creating it.`, "EDIT_WINDOW_PASSED");
  }
  await assertNotInCheckout(card.id);
  // Only while it's still unsold: a purchase landing in between wins.
  const updated = await prisma.business_gift_cards.updateMany({
    where: { id: card.id, soldStatus: { not: "purchased" }, status: "Active" },
    data: { ...fields(input), updatedAt: new Date() },
  });
  if (!updated.count) throw AppError.conflict("This gift card has just been bought, so it can't be changed.", "GIFT_CARD_SOLD");
  return giftCardView(await ownGiftCard(business.id, id), business.businessName);
}

async function ownerName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, surname: true, email: true } });
  return [user?.firstName, user?.surname].filter(Boolean).join(" ").trim() || user?.email || "Salon owner";
}

/** Takes a card off sale. A bought card with money left on it is the customer's, so only KHS can stop that one. */
export async function deactivateGiftCard(userId: string, id: string): Promise<GiftCardView> {
  const business = await requireMerchantBusiness(userId);
  const card = await ownGiftCard(business.id, id);
  if (card.status === "Inactive") throw AppError.conflict("This gift card is already deactivated.", "ALREADY_INACTIVE");
  if (card.status === "Used") throw AppError.conflict("This gift card has been fully used.", "GIFT_CARD_USED");
  if (card.soldStatus === "purchased" && Number(card.remainingAmount) > 0) {
    throw AppError.forbidden("A customer has bought this gift card and still has money on it. Contact KHS if it needs to be stopped.", "GIFT_CARD_HELD");
  }
  await assertNotInCheckout(card.id);
  const name = await ownerName(userId);
  const updated = await prisma.business_gift_cards.updateMany({
    where: { id: card.id, status: card.status, soldStatus: card.soldStatus },
    data: { status: "Inactive", deactivatedBy: name, deactivatedByRole: "merchant", deactivatedAt: new Date(), updatedAt: new Date() },
  });
  if (!updated.count) throw AppError.conflict("This gift card just changed. Please refresh and try again.", "GIFT_CARD_CHANGED");
  return giftCardView(await ownGiftCard(business.id, id), business.businessName);
}

/** Brings back a card the salon deactivated itself (one KHS stopped stays stopped). */
export async function reactivateGiftCard(userId: string, id: string): Promise<GiftCardView> {
  const business = await requireMerchantBusiness(userId);
  const card = await ownGiftCard(business.id, id);
  if (card.status !== "Inactive") throw AppError.badRequest("Only a deactivated gift card can be reactivated.", "NOT_INACTIVE");
  if (card.deactivatedByRole !== "merchant") {
    throw AppError.forbidden(
      card.deactivatedByRole === "admin" ? "KHS deactivated this gift card. Contact KHS if it should be reactivated." : "This gift card was deactivated before we recorded who did it. Contact KHS to reactivate it.",
      "DEACTIVATED_BY_KHS",
    );
  }
  if (card.soldStatus === "purchased" && card.expiresAt && card.expiresAt < new Date()) {
    throw AppError.badRequest("This gift card has passed its expiry date, so it can't be reactivated.", "GIFT_CARD_EXPIRED");
  }
  const updated = await prisma.business_gift_cards.updateMany({
    where: { id: card.id, status: "Inactive", deactivatedByRole: "merchant" },
    data: {
      status: "Active", deactivatedBy: null, deactivatedByRole: null, deactivatedAt: null, updatedAt: new Date(),
      // An unsold listing that sat inactive gets a fresh listing expiry.
      ...(card.soldStatus !== "purchased" ? { expiresAt: new Date(Date.now() + card.expiryInDays * 86_400_000) } : {}),
    },
  });
  if (!updated.count) throw AppError.conflict("This gift card just changed. Please refresh and try again.", "GIFT_CARD_CHANGED");
  return giftCardView(await ownGiftCard(business.id, id), business.businessName);
}

/** Removes an unsold card (kept on file, hidden everywhere). */
export async function deleteGiftCard(userId: string, id: string): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  const card = await ownGiftCard(business.id, id);
  if (card.soldStatus === "purchased") throw AppError.conflict("A gift card a customer has bought can't be deleted.", "GIFT_CARD_SOLD");
  await assertNotInCheckout(card.id);
  const removed = await prisma.business_gift_cards.updateMany({
    where: { id: card.id, soldStatus: "available" },
    data: { status: "deleted", updatedAt: new Date() },
  });
  if (!removed.count) throw AppError.conflict("This gift card has just been bought, so it can't be deleted.", "GIFT_CARD_SOLD");
}
