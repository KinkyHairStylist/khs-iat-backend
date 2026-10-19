import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { getPaymentSettings } from "../bookings/paymentSettings";

// The gift card shop: salon gift cards anyone signed in can buy. A card's code
// is its secret, so it's never part of these.

/**
 * The benefits column holds either a Postgres array literal ({"a","b"}, from
 * the old site) or plain comma-separated text (from the merchant form).
 */
export function parseBenefits(raw: string | null): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  if (text.startsWith("{") && text.endsWith("}")) {
    const items = text.slice(1, -1).match(/"((?:[^"\\]|\\.)*)"|[^,]+/g) ?? [];
    return items.map((s) => s.replace(/^"|"$/g, "").replace(/\\(.)/g, "$1").trim()).filter(Boolean);
  }
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

const FOR_SALE_WHERE = { soldStatus: "available", status: "Active", businesses: { status: "approved" } } as const;

const FOR_SALE_SELECT = {
  id: true, businessId: true, title: true, description: true, amount: true, benefits: true, expiryInDays: true, template: true, currency: true,
  businesses: { select: { id: true, businessName: true } },
} as const;

type ForSaleRow = Prisma.business_gift_cardsGetPayload<{ select: typeof FOR_SALE_SELECT }>;

function toShopCard({ businesses, ...card }: ForSaleRow) {
  return { ...card, amount: card.amount.toString(), benefits: parseBenefits(card.benefits), business: businesses };
}

/** Every gift card for sale (or one salon's), newest first. */
export async function listGiftCardsForSale(businessId?: string) {
  const cards = await prisma.business_gift_cards.findMany({
    where: { ...FOR_SALE_WHERE, ...(businessId ? { businessId } : {}) },
    select: FOR_SALE_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return cards.map(toShopCard);
}

/** One card for the purchase page, with the fee KHS adds on top (a percentage of the value). */
export async function getGiftCardForSale(giftCardId: string) {
  const card = await prisma.business_gift_cards.findFirst({ where: { id: giftCardId, ...FOR_SALE_WHERE }, select: FOR_SALE_SELECT });
  if (!card) throw AppError.notFound("Gift card");
  const { giftCardFeeRate } = await getPaymentSettings();
  return { ...toShopCard(card), feeRate: giftCardFeeRate };
}
