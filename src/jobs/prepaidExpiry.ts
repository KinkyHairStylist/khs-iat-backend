import { giftCardExpiredEmail, membershipExpiredEmail } from "../emails/prepaidExpiryEmails";
import { sendEmailInBackground } from "../lib/emailEngine/sendgrid";
import prisma, { MONEY_TX_OPTIONS } from "../lib/prisma/prisma";
import { notifySlack } from "../lib/slack";
import { chargeSalonWallet, creditSalonWallet, LEDGER_CURRENCY } from "../services/bookings/ledger";
import { fromCents } from "../services/bookings/paymentQuote";
import { getPaymentSettings } from "../services/bookings/paymentSettings";
import { formatMoney } from "../utils/money";

// Daily: memberships and gift cards past their expiry date. The unused value is
// split between the salon and KHS (admin > Payments, default 50/50).
//  - Membership: the salon is paid per session redeemed, so it hasn't had the
//    unused sessions' money; its share is paid into its wallet.
//  - Gift card: the salon was paid the card's full value when it was sold, so
//    it already holds the unused balance; KHS's share is taken from its wallet.
//    (The old cron paid the salon another half here, so it ended up with 150%.)
// Each row is claimed (status moves on) in the same transaction as its money.

interface Split { salonCents: number; khsCents: number }
const split = (unusedCents: number, salonShare: number): Split => {
  const salonCents = Math.round((unusedCents * salonShare) / 100);
  return { salonCents, khsCents: unusedCents - salonCents };
};

async function expireMemberships(salonShare: number): Promise<number> {
  const due = await prisma.$queryRaw<Array<{ id: string; businessId: string; ownerId: string; remaining: number; priceCents: number; packageName: string | null; email: string | null; firstName: string | null }>>`
    SELECT m.id::text, m."businessId"::text AS "businessId", b.owner_id::text AS "ownerId", m."remainingSessions" AS remaining,
           ROUND(p."pricePerSession" * 100)::int AS "priceCents", s.name AS "packageName", u.email, u."firstName"
    FROM merchant_membership_purchases m
    JOIN merchant_membership_packages p ON p.id = m."packageId"
    JOIN businesses b ON b.id = m."businessId"
    LEFT JOIN "Service" s ON s.id = p."serviceId"
    LEFT JOIN "user" u ON u.id = m."clientId"
    WHERE m.status = 'ACTIVE' AND m."expiresAt" < NOW()`;

  let expired = 0;
  for (const m of due) {
    const { salonCents, khsCents } = split(m.remaining * m.priceCents, salonShare);
    const claimed = await prisma.$transaction(async (tx) => {
      const moved = await tx.merchant_membership_purchases.updateMany({ where: { id: m.id, status: "ACTIVE" }, data: { status: "EXPIRED", remainingSessions: 0, updatedAt: new Date() } });
      if (!moved.count || m.remaining <= 0) return moved.count > 0;
      const label = `expired membership (${m.packageName || "package"})`;
      if (salonCents > 0) {
        await creditSalonWallet(tx, { businessId: m.businessId, ownerId: m.ownerId, amountCents: salonCents, senderId: m.ownerId, description: `Business share of ${label}`, referenceId: m.id, method: "Stripe" });
      }
      if (khsCents > 0) {
        await tx.transactions.create({
          data: {
            recipientId: m.ownerId, amount: fromCents(khsCents), type: "Fee", feeSubtype: "MembershipExpirySplit", currency: LEDGER_CURRENCY,
            description: `KHS share of ${label}`, mode: "System", referenceId: m.id, status: "completed", method: "Stripe", service: "PrepaidPool-Expiry-Fee",
          },
        });
      }
      return true;
    }, MONEY_TX_OPTIONS);
    if (!claimed) continue;
    expired++;
    if (m.remaining > 0 && m.email) {
      sendEmailInBackground({ to: m.email, ...membershipExpiredEmail({ name: m.firstName || "there", sessions: m.remaining, packageName: m.packageName || "membership" }) });
    }
  }
  return expired;
}

async function expireGiftCards(salonShare: number): Promise<number> {
  const due = await prisma.$queryRaw<Array<{ id: string; businessId: string; ownerId: string; balanceCents: number; title: string; email: string | null; name: string | null }>>`
    SELECT g.id::text, g."businessId"::text AS "businessId", b.owner_id::text AS "ownerId", ROUND(g."remainingAmount" * 100)::int AS "balanceCents",
           g.title, COALESCE(NULLIF(g."recipientEmail", ''), g."ownerEmail") AS email, COALESCE(NULLIF(g."recipientName", ''), g."ownerFullName") AS name
    FROM business_gift_cards g
    JOIN businesses b ON b.id = g."businessId"
    WHERE g.status = 'Active' AND g."soldStatus" = 'purchased' AND g."expiresAt" < NOW()`;

  let expired = 0;
  for (const g of due) {
    const { khsCents } = split(g.balanceCents, salonShare);
    const claimed = await prisma.$transaction(async (tx) => {
      const moved = await tx.business_gift_cards.updateMany({ where: { id: g.id, status: "Active" }, data: { status: "Expired", remainingAmount: 0, updatedAt: new Date() } });
      if (!moved.count) return false;
      if (khsCents > 0) {
        await chargeSalonWallet(tx, {
          businessId: g.businessId, ownerId: g.ownerId, amountCents: khsCents, type: "Fee", feeSubtype: "GiftCardExpirySplit",
          service: "PrepaidPool-Expiry-Fee", description: `KHS share of expired gift card "${g.title}"`, referenceId: g.id,
        });
      }
      return true;
    }, MONEY_TX_OPTIONS);
    if (!claimed) continue;
    expired++;
    if (g.balanceCents > 0 && g.email) {
      sendEmailInBackground({ to: g.email, ...giftCardExpiredEmail({ name: g.name || "there", title: g.title, balance: formatMoney(g.balanceCents / 100) }) });
    }
  }
  return expired;
}

export async function prepaidExpiry(): Promise<string> {
  const { prepaidExpirySalonShare } = await getPaymentSettings();
  const memberships = await expireMemberships(prepaidExpirySalonShare);
  const giftCards = await expireGiftCards(prepaidExpirySalonShare);
  if (memberships || giftCards) {
    notifySlack({ node: "Payment", type: "CRON_EXECUTION", trigger: "Prepaid expiry sweep", body: `• Memberships expired: ${memberships}\n• Gift cards expired: ${giftCards}` });
  }
  return `memberships ${memberships}, gift cards ${giftCards}`;
}
