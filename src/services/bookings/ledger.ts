import { CURRENCY } from "../../config/env";
import { Prisma } from "../../generated/prisma/client";
import type { transactions_currency_enum, transactions_method_enum } from "../../generated/prisma/enums";
import { getPaymentSettings } from "./paymentSettings";
import { fromCents, salonFeesCents } from "./paymentQuote";

// Money records for bookings, in the shared transactions table the staff and
// merchant apps read. Same rows the Kinky-Hair-Stylist backend writes, in the
// platform currency.

type Tx = Prisma.TransactionClient;

const LEDGER_CURRENCIES: readonly string[] = ["USD", "EUR", "AUD", "GBP", "NGN"];
if (!LEDGER_CURRENCIES.includes(CURRENCY)) {
  throw new Error(`CURRENCY=${CURRENCY} can't be recorded in the ledger (it takes ${LEDGER_CURRENCIES.join(", ")})`);
}
export const LEDGER_CURRENCY = CURRENCY as transactions_currency_enum;

/** Booking money paid to a salon waits this long in its pending balance, so a chargeback in that window is recovered from money not yet handed out. */
export const PAYOUT_DELAY_HOURS = 48;
export const payoutAvailableAt = (now = Date.now()) => new Date(now + PAYOUT_DELAY_HOURS * 3_600_000);

export interface LedgerParty {
  customerId: string;
  customerName: string;
  /** The salon owner — who the booking money is for and who KHS's fees are taken from. */
  ownerId: string;
}

/** The customer's payment towards a booking (service "Booking"). */
export function bookingPaymentRow(p: LedgerParty, input: {
  amountCents: number; method: transactions_method_enum; description: string; referenceId: string; completed: boolean;
}): Prisma.transactionsCreateManyInput {
  return {
    senderId: p.customerId, recipientId: p.ownerId, amount: fromCents(input.amountCents), type: "Debit",
    currency: LEDGER_CURRENCY, description: input.description, mode: "Web", referenceId: input.referenceId,
    status: input.completed ? "completed" : "pending", method: input.method, service: "Booking", customerName: p.customerName,
  };
}

/** A fee on a booking (service "Booking-Fee"): Acquisition / Commission from the salon, StripePassthrough from the customer. */
export function bookingFeeRow(p: LedgerParty, input: {
  amountCents: number; subtype: "Acquisition" | "Commission" | "StripePassthrough"; method: transactions_method_enum;
  description: string; referenceId: string; completed: boolean;
}): Prisma.transactionsCreateManyInput {
  return {
    senderId: input.subtype === "StripePassthrough" ? p.customerId : p.ownerId, amount: fromCents(input.amountCents), type: "Fee",
    feeSubtype: input.subtype, currency: LEDGER_CURRENCY, description: input.description, mode: "Web", referenceId: input.referenceId,
    status: input.completed ? "completed" : "pending", method: input.method, service: "Booking-Fee", customerName: p.customerName,
  };
}

/** Whether KHS has already taken its one-time acquisition fee for this customer at this salon. */
export async function hasAcquisitionClaim(db: Tx, businessId: string, clientId: string): Promise<boolean> {
  return !!(await db.business_client_acquisitions.findFirst({ where: { businessId, clientId }, select: { id: true } }));
}

/**
 * Records this booking as the customer's first with the salon. False when
 * another booking got there first (the acquisition fee is then not owed).
 */
export async function claimAcquisition(db: Tx, businessId: string, clientId: string, orderId: string): Promise<boolean> {
  const inserted = await db.$executeRaw`
    INSERT INTO business_client_acquisitions ("businessId", "clientId", "orderId")
    VALUES (${businessId}::uuid, ${clientId}::uuid, ${orderId})
    ON CONFLICT ("businessId", "clientId") DO NOTHING`;
  return inserted === 1;
}

/** KHS's fees on a booking: commission, plus the acquisition fee unless this customer was already claimed. */
export async function bookingFees(db: Tx, input: { businessId: string; clientId: string; planTier: string; serviceTotalCents: number }) {
  const settings = await getPaymentSettings();
  const firstBooking = !(await hasAcquisitionClaim(db, input.businessId, input.clientId));
  const acquisitionRate = firstBooking ? settings.acquisitionFeeTiers[input.planTier] ?? 0 : 0;
  return { ...salonFeesCents(input.serviceTotalCents, settings.commissionRate, acquisitionRate), settings };
}

/**
 * Takes a fee from the salon's wallet, pending balance first. Used when the
 * salon was already paid for this money (a gift card it sold). Atomic, so two
 * debits can't overwrite each other.
 */
export async function debitSalonWallet(db: Tx, input: {
  businessId: string; ownerId: string; amountCents: number; subtype: "Acquisition" | "Commission"; orderId: string; customerName: string;
}): Promise<void> {
  const amount = fromCents(input.amountCents);
  await db.$executeRaw`
    INSERT INTO business_wallets ("businessId", "ownerId", currency, description)
    VALUES (${input.businessId}::uuid, ${input.ownerId}::uuid, ${LEDGER_CURRENCY}::business_wallets_currency_enum, 'Business wallet - auto-created from booking')
    ON CONFLICT ("businessId") DO NOTHING`;
  const [wallet] = await db.$queryRaw<Array<{ id: string; currency: transactions_currency_enum }>>`
    UPDATE business_wallets SET
      "pendingBalance" = "pendingBalance" - LEAST(${amount}::numeric, GREATEST("pendingBalance", 0)),
      balance = balance - GREATEST(${amount}::numeric - GREATEST("pendingBalance", 0), 0),
      "totalExpenses" = "totalExpenses" + ${amount}::numeric,
      "updatedAt" = NOW()
    WHERE "businessId" = ${input.businessId}::uuid
    RETURNING id, currency::text AS currency`;
  await db.transactions.create({
    data: {
      walletId: wallet.id, senderId: input.ownerId, amount, type: "Fee", feeSubtype: input.subtype, currency: wallet.currency,
      description: `${input.subtype === "Acquisition" ? "Acquisition fee" : "Commission"} for appointment order ${input.orderId}`,
      referenceId: input.orderId, status: "completed", mode: "Web", method: "Stripe", customerName: input.customerName,
    },
  });
}

/**
 * Pays money into the salon's wallet, with an "Earning" record. `availableAt`
 * set: it waits in the pending balance until then (the merchant app releases
 * it); unset: it's available at once. Atomic like debitSalonWallet.
 */
export async function creditSalonWallet(db: Tx, input: {
  businessId: string; ownerId: string; amountCents: number; senderId: string; description: string; referenceId: string;
  method: transactions_method_enum; availableAt?: Date;
}): Promise<void> {
  const amount = fromCents(input.amountCents);
  const pending = !!input.availableAt;
  await db.$executeRaw`
    INSERT INTO business_wallets ("businessId", "ownerId", currency, description)
    VALUES (${input.businessId}::uuid, ${input.ownerId}::uuid, ${LEDGER_CURRENCY}::business_wallets_currency_enum, 'Business wallet - auto-created')
    ON CONFLICT ("businessId") DO NOTHING`;
  const [wallet] = await db.$queryRaw<Array<{ id: string; currency: transactions_currency_enum }>>`
    UPDATE business_wallets SET
      balance = balance + ${pending ? 0 : amount}::numeric,
      "pendingBalance" = "pendingBalance" + ${pending ? amount : 0}::numeric,
      "totalIncome" = "totalIncome" + ${amount}::numeric,
      "updatedAt" = NOW()
    WHERE "businessId" = ${input.businessId}::uuid
    RETURNING id, currency::text AS currency`;
  await db.transactions.create({
    data: {
      walletId: wallet.id, senderId: input.senderId, recipientId: input.ownerId, amount, type: "Earning", currency: wallet.currency,
      description: input.description, referenceId: input.referenceId, status: "completed", mode: "Web", method: input.method,
      availableAt: input.availableAt ?? null,
    },
  });
}
