import prisma from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { giftCardPurchasedEmail, giftCardReceivedEmail, merchantGiftCardSoldEmail } from "../../emails";
import { formatMoney } from "../../utils/money";
import { getServiceLogger } from "../../utils/loggerCreator";
import { notifyUser } from "../notificationsService";

const logger = getServiceLogger("gift-card-sales");

type Recipient = { name: string; email: string; senderName: string; message: string | null };

/**
 * Tells the buyer (email with the code), the person it's for (when the buyer
 * gave a different email), the salon (bell and email; KHS gets
 * the email when the salon has none) and KHS on Slack about a gift card sale.
 * Fire-and-forget: the sale is already done.
 */
export function announceGiftCardSale(sale: { cardId: string; buyerId: string; buyerName: string; buyerEmail: string; valueCents: number; recipient: Recipient }): void {
  void (async () => {
    const card = await prisma.business_gift_cards.findUniqueOrThrow({
      where: { id: sale.cardId },
      select: { id: true, code: true, title: true, businessId: true, expiresAt: true, businesses: { select: { businessName: true, owner_id: true, ownerName: true, ownerEmail: true } } },
    });
    const salon = card.businesses;
    const value = formatMoney(sale.valueCents / 100);

    const { recipient } = sale;
    const forSomeoneElse = recipient.email.toLowerCase() !== sale.buyerEmail.toLowerCase();
    const named = recipient.name !== sale.buyerName;
    sendEmailInBackground({
      to: sale.buyerEmail,
      ...giftCardPurchasedEmail({ name: sale.buyerName, code: card.code, value, recipientName: named ? recipient.name : undefined, senderName: named ? recipient.senderName : undefined }),
      cc: DELIVERY_TEAM_EMAIL || undefined,
    });
    if (forSomeoneElse) {
      sendEmailInBackground({
        to: recipient.email,
        ...giftCardReceivedEmail({
          recipientName: recipient.name, senderName: recipient.senderName, code: card.code, value, message: recipient.message,
          businessName: salon.businessName, businessId: card.businessId, expiresOn: card.expiresAt ? card.expiresAt.toLocaleDateString("en-AU") : "-",
        }),
      });
    }

    notifyUser(salon.owner_id, {
      type: "SYSTEM",
      title: "Gift card sold",
      message: `${sale.buyerName} bought your gift card "${card.title}" for ${value}. The amount has been added to your wallet.`,
      link: "/merchant/dashboard/gift-management",
      metadata: { giftCardId: card.id, businessId: card.businessId, amount: sale.valueCents / 100 },
    });
    const owner = await prisma.user.findUnique({ where: { id: salon.owner_id }, select: { email: true, firstName: true, surname: true } });
    const to = salon.ownerEmail || owner?.email || DELIVERY_TEAM_EMAIL;
    if (to) {
      const merchantName = salon.ownerName || `${owner?.firstName ?? ""} ${owner?.surname ?? ""}`.trim() || "Salon Owner";
      const email = merchantGiftCardSoldEmail({ merchantName, businessName: salon.businessName, purchaserName: sale.buyerName, title: card.title, amount: value });
      sendEmailInBackground({ to, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }

    notifySlack({
      node: "Payment",
      trigger: "Gift card purchased",
      body: `• Card: "${card.title}"
        • Salon: ${salon.businessName}
        • Buyer: ${sale.buyerName} (${sale.buyerEmail})${forSomeoneElse ? `
        • Sent to: ${recipient.name} (${recipient.email})` : ""}
        • Amount: ${value}`,
    });
  })().catch((err: Error) => logger.error("Could not announce a gift card sale", { cardId: sale.cardId, error: err.message }));
}
