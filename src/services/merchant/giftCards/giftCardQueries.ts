import prisma from "../../../lib/prisma/prisma";
import type { business_gift_cards, Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import type { GiftCardListQuery } from "../../../schemas/merchant/giftCards.schema";
import { parseBenefits } from "../../customer/giftCardShopService";
import { requireMerchantBusiness } from "../merchantBusiness";

// A salon's gift cards as its dashboard shows them. The code redeems a card,
// so it's never part of anything returned here — it goes to the buyer by email.

/** Hours after creating a card that it can still be changed (and only while unsold). */
export const EDIT_WINDOW_HOURS = 24;
const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export function giftCardView(c: business_gift_cards, businessName: string) {
  const sold = c.soldStatus === "purchased";
  const expired = c.status === "Expired" || (c.status !== "Used" && !!c.expiresAt && c.expiresAt <= new Date());
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    message: c.message,
    template: c.template,
    amount: money(c.amount),
    remainingAmount: sold ? money(c.remainingAmount) : money(c.amount),
    currency: c.currency || "AUD",
    benefits: parseBenefits(c.benefits),
    expiryInDays: c.expiryInDays,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    status: c.status,
    expired,
    sold,
    recipientName: sold ? c.recipientName || null : null,
    recipientEmail: sold ? c.recipientEmail || null : null,
    deactivatedBy: c.deactivatedBy,
    deactivatedByRole: c.deactivatedByRole,
    deactivatedAt: c.deactivatedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    businessName,
    /** Unsold and inside the edit window. */
    editable: !sold && c.status === "Active" && Date.now() - c.createdAt.getTime() <= EDIT_WINDOW_HOURS * 3_600_000,
  };
}
export type GiftCardView = ReturnType<typeof giftCardView>;

/** One of this salon's (not deleted) cards, or 404. */
export async function ownGiftCard(businessId: string, id: string): Promise<business_gift_cards> {
  const card = await prisma.business_gift_cards.findFirst({ where: { id, businessId, status: { not: "deleted" } } });
  if (!card) throw AppError.notFound("Gift card");
  return card;
}

export async function listGiftCards(userId: string, q: GiftCardListQuery) {
  const business = await requireMerchantBusiness(userId);
  const now = new Date();
  const statusWhere: Prisma.business_gift_cardsWhereInput =
    q.status === "All"
      ? { status: { not: "deleted" } }
      : q.status === "Expired"
        ? { OR: [{ status: "Expired" }, { status: { in: ["Active", "Inactive"] }, expiresAt: { lte: now } }] }
        : q.status === "Active"
          ? { status: "Active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
          : { status: q.status };
  const search = q.search
    ? { OR: ["title", "description", "recipientName", "recipientEmail"].map((f) => ({ [f]: { contains: q.search, mode: "insensitive" as const } })) }
    : {};
  const where: Prisma.business_gift_cardsWhereInput = { businessId: business.id, AND: [statusWhere, search] };

  const [rows, total] = await Promise.all([
    prisma.business_gift_cards.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.business_gift_cards.count({ where }),
  ]);
  return {
    giftCards: rows.map((c) => giftCardView(c, business.businessName)),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    startIndex: total ? (q.page - 1) * q.limit + 1 : 0,
    endIndex: Math.min(q.page * q.limit, total),
  };
}

export async function getGiftCard(userId: string, id: string) {
  const business = await requireMerchantBusiness(userId);
  return giftCardView(await ownGiftCard(business.id, id), business.businessName);
}

/** The dashboard's top-line numbers, counted the same way the list shows the cards. */
export async function giftCardSummary(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const cards = await prisma.business_gift_cards.findMany({
    where: { businessId: business.id, status: { not: "deleted" } },
    select: { amount: true, remainingAmount: true, status: true, soldStatus: true, expiresAt: true, currency: true },
  });
  const now = new Date();
  const sold = cards.filter((c) => c.soldStatus === "purchased");
  const totalValue = cards.reduce((s, c) => s + Number(c.amount), 0);
  const soldValue = sold.reduce((s, c) => s + Number(c.amount), 0);
  const remaining = sold.reduce((s, c) => s + Number(c.remainingAmount), 0);
  return {
    currency: cards[0]?.currency || null,
    totalCards: cards.length,
    totalValue: money(totalValue),
    totalSoldCards: sold.length,
    totalSoldValue: money(soldValue),
    totalRedeemedCards: cards.filter((c) => c.status === "Used").length,
    totalRedeemedValue: money(soldValue - remaining),
    totalRemainingValue: money(remaining),
    totalAvailableCards: cards.filter((c) => c.soldStatus !== "purchased" && c.status === "Active" && (!c.expiresAt || c.expiresAt > now)).length,
    totalExpiredCards: cards.filter((c) => c.status !== "Used" && (c.status === "Expired" || (!!c.expiresAt && c.expiresAt <= now))).length,
  };
}
