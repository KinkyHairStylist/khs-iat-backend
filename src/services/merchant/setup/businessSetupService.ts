import crypto from "crypto";
import { Prisma } from "../../../generated/prisma/client";
import prisma, { MONEY_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../../config/env";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../../lib/slack";
import { createBusinessCustomer } from "../../../lib/stripe/billing";
import { merchantUnderReviewEmail } from "../../../emails";
import { AppError } from "../../../middlewares/centralAppError";
import type { CreateBusinessInput } from "../../../schemas/merchant/setup.schema";
import { LEDGER_CURRENCY } from "../../bookings/ledger";
import { resolveSignup, type ResolvedSignup } from "./signupPaymentService";

// The last step of business setup: the business and everything it starts
// with, saved together. A merchant runs one business; a second submission
// (a double click, a retry) is refused instead of creating a duplicate.

const ALREADY_HAS_BUSINESS = "You've already set up your business. Head to your dashboard to manage it.";
const COMPANY_SIZE = { solo: "solo", "small-team": "small_team", "multi-staff": "multi_staff" } as const;

/** A "09:00" opening time as the Time column stores it. */
const asTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true, phoneNumber: true } });
  if (await prisma.businesses.findFirst({ where: { owner_id: userId }, select: { id: true } })) {
    throw AppError.conflict(ALREADY_HAS_BUSINESS, "ALREADY_HAS_BUSINESS");
  }

  // No payment, no merchant: the chosen start is checked before anything is saved.
  const signup = await resolveSignup(userId, input.signup);
  const businessId = crypto.randomUUID();
  // MVP merchants get a Stripe customer up front (they'll pay by card when MVP ends);
  // made before the transaction so a slow Stripe call never holds database locks.
  const mvpCustomer = signup.option === "reveal" ? await createBusinessCustomer({ businessId, email: owner.email, name: input.businessName }) : null;
  const ownerName = `${owner.firstName ?? ""} ${owner.surname ?? ""}`.trim();

  await prisma.$transaction(async (tx) => {
    // One setup per merchant at a time, then re-check: two submissions can't both create a business.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merchant-setup:${userId}`}))`;
    if (await tx.businesses.findFirst({ where: { owner_id: userId }, select: { id: true } })) {
      throw AppError.conflict(ALREADY_HAS_BUSINESS, "ALREADY_HAS_BUSINESS");
    }

    await tx.businesses.create({
      data: {
        id: businessId,
        owner_id: userId,
        businessName: input.businessName,
        description: input.description,
        primaryAudience: input.primaryAudience,
        service: input.services,
        businessAddress: input.businessAddress,
        country: input.country ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        companySize: COMPANY_SIZE[input.companySize],
        howDidYouHear: input.howDidYouHear,
        planTier: signup.planTier,
        ownerName: ownerName || null,
        ownerEmail: owner.email,
        ownerPhone: owner.phoneNumber,
      },
    });
    await tx.booking_policies.create({
      data: {
        businessId,
        minimumLeadTime: input.bookingPolicies.minimumLeadTime,
        bufferTime: input.bookingPolicies.bufferTime,
        cancellationWindow: input.bookingPolicies.cancellationWindow,
      },
    });
    await tx.booking_days.createMany({
      data: input.bookingHours.map((d) => ({ businessId, day: d.day, isOpen: d.isOpen, startTime: asTime(d.startTime), endTime: asTime(d.endTime) })),
    });
    // The two booking questions setup asks live in the owner settings (Settings > Booking Rules).
    const { allowDoubleBookings, allowDepositPayment } = input.bookingPolicies;
    await tx.business_owner_settings.create({
      data: {
        ownerId: userId,
        businessId,
        ...(allowDoubleBookings !== undefined ? { bookingRulesAllowdoublebookings: allowDoubleBookings } : {}),
        ...(allowDepositPayment !== undefined ? { pricingPoliciesAllowdepositpayment: allowDepositPayment } : {}),
      },
    });
    await tx.$executeRaw`
      INSERT INTO business_wallets ("businessId", "ownerId", currency, description)
      VALUES (${businessId}::uuid, ${userId}::uuid, ${LEDGER_CURRENCY}::business_wallets_currency_enum, 'Business wallet - auto-created')`;
    await recordSignup(tx, businessId, signup, mvpCustomer?.id ?? null);
    await tx.user.update({ where: { id: userId }, data: { isMerchant: true, isCustomer: false, isStaff: false, updatedAt: new Date() } });
  }, MONEY_TX_OPTIONS);

  announceNewBusiness({ businessId, businessName: input.businessName, ownerName, ownerEmail: owner.email, option: signup.option, tier: signup.planTier });
  return { businessId, businessName: input.businessName };
}

/**
 * A paid plan or MVP gets its subscription record now. A Trial has nothing to
 * record yet: it starts when an admin approves the business.
 */
async function recordSignup(tx: Prisma.TransactionClient, businessId: string, signup: ResolvedSignup, mvpCustomerId: string | null): Promise<void> {
  if (signup.option === "paid" && signup.paid) {
    await tx.merchant_subscriptions.create({
      data: {
        businessId, status: "active", kind: "paid", trialEndsAt: null, currentPeriodEnd: signup.paid.currentPeriodEnd,
        stripeCustomerId: signup.paid.customerId, stripeSubscriptionId: signup.paid.subscriptionId,
      },
    });
  } else if (signup.option === "reveal" && signup.windowEndsAt) {
    await tx.merchant_subscriptions.create({
      data: { businessId, status: "trialing", kind: "reveal", trialEndsAt: signup.windowEndsAt, stripeCustomerId: mvpCustomerId },
    });
  }
}

/** "Under review" email (the team gets a copy) and the Slack notice — neither holds up setup. */
function announceNewBusiness(b: { businessId: string; businessName: string; ownerName: string; ownerEmail: string; option: string; tier: string }): void {
  sendEmailInBackground({ to: b.ownerEmail, ...merchantUnderReviewEmail({ businessName: b.businessName }), cc: DELIVERY_TEAM_EMAIL || undefined });
  const start = b.option === "paid" ? `paid (${b.tier})` : b.option === "reveal" ? "MVP" : "Trial";
  notifySlack({
    node: "Application",
    trigger: `${b.ownerName || "Merchant"} <${b.ownerEmail}>`,
    body: `New business submitted for review
      • Business: ${b.businessName}
      • Owner: ${b.ownerName || "N/A"} (${b.ownerEmail})
      • Start: ${start}
      • ID: ${b.businessId}`,
  });
}
