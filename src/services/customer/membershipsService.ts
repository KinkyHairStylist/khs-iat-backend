import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { CURRENCY } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { createPaymentIntent, retrievePaymentIntent } from "../../lib/stripe";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { membershipPurchasedEmail } from "../../emails";
import { formatMoney } from "../../utils/money";
import { getServiceLogger } from "../../utils/loggerCreator";
import { bookingPaymentRow } from "../bookings/ledger";
import { fromCents, MIN_CARD_CHARGE_CENTS } from "../bookings/paymentQuote";

const logger = getServiceLogger("memberships");

// Membership packages: a number of sessions of one service at one salon,
// paid for in full up front. The salon is paid per session as they're used
// (see bookings/payWithMembership); KHS takes its commission then.

const PACKAGE_SELECT = {
  id: true, businessId: true, serviceId: true, pricePerSession: true, sessionCount: true, expiryDays: true, isActive: true,
  Service: { select: { id: true, name: true, price: true } },
} as const;

const packageTotalCents = (p: { pricePerSession: { toString(): string }; sessionCount: number }) =>
  Math.round(Number(p.pricePerSession.toString()) * 100) * p.sessionCount;

const packageView = <T extends { Service: unknown; pricePerSession: { toString(): string } }>({ Service, pricePerSession, ...rest }: T) => ({
  ...rest,
  pricePerSession: pricePerSession.toString(),
  service: Service,
});

/** The packages an approved salon sells. */
export async function listSalonPackages(businessId: string) {
  const packages = await prisma.merchant_membership_packages.findMany({
    where: { businessId, isActive: true, businesses: { status: "approved" } },
    select: PACKAGE_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return packages.map(packageView);
}

/** The customer's memberships, newest first, with the salon's name. */
export async function listOwnedMemberships(userId: string) {
  const rows = await prisma.merchant_membership_purchases.findMany({
    where: { clientId: userId },
    select: {
      id: true, packageId: true, businessId: true, remainingSessions: true, purchasedAt: true, expiresAt: true, status: true,
      merchant_membership_packages: { select: { ...PACKAGE_SELECT, businesses: { select: { businessName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ merchant_membership_packages: pkg, ...purchase }) => {
    const { businesses, ...rest } = pkg;
    // A membership past its date is expired whatever its row says (nothing runs to update it).
    const status = purchase.status === "ACTIVE" && purchase.expiresAt < new Date() ? "EXPIRED" : purchase.status;
    return { ...purchase, status, businessName: businesses.businessName, package: packageView(rest) };
  });
}

/** Starts buying a package: a card payment for the whole package. Nothing is granted until it's paid. */
export async function startMembershipPurchase(userId: string, packageId: string) {
  const pkg = await prisma.merchant_membership_packages.findFirst({
    where: { id: packageId, isActive: true, businesses: { status: "approved" } },
    select: { id: true, businessId: true, sessionCount: true, pricePerSession: true, businesses: { select: { owner_id: true } } },
  });
  if (!pkg) throw AppError.notFound("Membership package");
  const totalCents = packageTotalCents(pkg);
  if (totalCents < MIN_CARD_CHARGE_CENTS) throw AppError.badRequest("This package is too small to pay by card.");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true } });
  const intent = await createPaymentIntent({
    amountCents: totalCents,
    currency: CURRENCY,
    email: user.email,
    metadata: { kind: "membership", packageId: pkg.id, purchaserId: userId },
  });
  if (!intent.client_secret) throw AppError.internal();

  await prisma.transactions.createMany({
    data: [{
      ...bookingPaymentRow(
        { customerId: userId, ownerId: pkg.businesses.owner_id, customerName: `${user.firstName ?? ""} ${user.surname ?? ""}`.trim() },
        { amountCents: totalCents, method: "Stripe", description: `Purchase of membership package (${pkg.sessionCount} sessions)`, referenceId: intent.id, completed: false },
      ),
      service: "Membership-Purchase",
    }],
  });

  return { amount: fromCents(totalCents), sessionCount: pkg.sessionCount, clientSecret: intent.client_secret, reference: intent.id };
}

/**
 * After the card form accepted the payment: grants the membership once
 * Stripe says it's paid. Safe to call again — the second call returns the
 * same membership.
 */
export async function completeMembershipPurchase(userId: string, reference: string) {
  const intent = await retrievePaymentIntent(reference);
  if (intent.metadata?.kind !== "membership" || intent.metadata.purchaserId !== userId) throw AppError.notFound("Payment");
  if (intent.status !== "succeeded") throw AppError.badRequest("Your payment hasn't gone through yet. Please try again in a moment.", "PAYMENT_NOT_COMPLETE");

  const pkg = await prisma.merchant_membership_packages.findUnique({
    where: { id: intent.metadata.packageId },
    select: { id: true, businessId: true, sessionCount: true, expiryDays: true, pricePerSession: true, Service: { select: { name: true } }, businesses: { select: { businessName: true } } },
  });
  if (!pkg) throw AppError.notFound("Membership package");

  const result = await prisma.$transaction(async (tx) => {
    // One grant per payment, however many times this is called at once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership:${reference}`}))`;
    const existing = await tx.merchant_membership_purchases.findFirst({ where: { stripePaymentIntentId: reference } });
    if (existing) return { purchase: existing, created: false };

    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt.getTime() + pkg.expiryDays * 86_400_000);
    const purchase = await tx.merchant_membership_purchases.create({
      data: {
        packageId: pkg.id, businessId: pkg.businessId, clientId: userId, remainingSessions: pkg.sessionCount,
        purchasedAt, expiresAt, status: "ACTIVE", stripePaymentIntentId: reference,
      },
    });
    await tx.transactions.updateMany({ where: { referenceId: reference, service: "Membership-Purchase" }, data: { status: "completed", updatedAt: new Date() } });
    return { purchase, created: true };
  }, MONEY_TX_OPTIONS);

  if (result.created) announcePurchase(userId, pkg, result.purchase.expiresAt);
  return { purchase: result.purchase, alreadyCompleted: !result.created };
}

function announcePurchase(
  userId: string,
  pkg: { sessionCount: number; pricePerSession: { toString(): string }; Service: { name: string | null }; businesses: { businessName: string } },
  expiresAt: Date,
): void {
  void (async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, surname: true } });
    const packageName = pkg.Service.name || "membership package";
    const expiresOn = expiresAt.toLocaleDateString("en-AU");
    notifySlack({
      node: "Payment",
      trigger: "Membership package purchased",
      body: `• Customer: ${user?.firstName ?? ""} ${user?.surname ?? ""} (${user?.email ?? "no email"})
        • Package: ${packageName} (${pkg.sessionCount} sessions) at ${pkg.businesses.businessName}
        • Amount: ${formatMoney(fromCents(packageTotalCents(pkg)))}
        • Expires: ${expiresOn}`,
    });
    if (user?.email) {
      const email = membershipPurchasedEmail({ name: user.firstName || "there", packageName, sessions: pkg.sessionCount, businessName: pkg.businesses.businessName, expiresOn });
      sendEmailInBackground({ to: user.email, ...email });
    }
  })().catch((err: Error) => logger.error("Could not announce a membership purchase", { error: err.message }));
}
