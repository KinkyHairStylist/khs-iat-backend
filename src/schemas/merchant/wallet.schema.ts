import { z } from "zod";
import { calendarDate } from "../fields";

// The salon's wallet: its ledger, payout accounts and withdrawals. Wallet and
// business always come from the session, never from the request.

const PAYOUT_CURRENCIES = ["USD", "EUR", "AUD", "GBP", "NGN"] as const;
const payoutCurrency = z.enum(PAYOUT_CURRENCIES, { error: "Choose a payout currency." });

export const walletSummaryQuerySchema = z.object({
  date: calendarDate(),
  timezoneOffset: z.coerce.number().int().min(-14 * 60).max(14 * 60).optional(),
});

export const walletTransactionQuerySchema = z.object({
  type: z.enum(["All", "Earning", "Withdrawal", "Debit", "Refund"]).default("All"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type WalletTransactionQuery = z.infer<typeof walletTransactionQuerySchema>;

const digits = (label: string, min: number, max: number) =>
  z.string({ error: `${label} is required.` }).transform((v) => v.replace(/[\s-]/g, "")).pipe(
    z.string().regex(new RegExp(`^\\d{${min},${max}}$`), `${label} must be ${min === max ? min : `${min}–${max}`} digits.`),
  );

/** A bank account KHS pays by hand. */
export const bankAccountSchema = z.object({
  accountHolderName: z.string().trim().min(2, "Enter the account holder's name.").max(100).regex(/^[\p{L}\d\s.,&'()-]+$/u, "Use letters, numbers and spaces in the account holder's name."),
  bankName: z.string().trim().min(2, "Enter the bank's name.").max(100),
  accountNumber: digits("Account number", 6, 18),
  // Sort code (UK), BSB (Australia), routing number (US)…
  sortCode: digits("Sort code / BSB / routing number", 6, 9),
  payoutCurrency,
  isDefault: z.boolean().optional().default(false),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const payoutCurrencySchema = z.object({ payoutCurrency });

export const airwallexBeneficiarySchema = z.object({
  answers: z
    .record(z.string().max(64), z.string().trim().max(200))
    .refine((a) => Object.keys(a).length <= 40, "Too many fields."),
});

const amount = z
  .number({ error: "Enter an amount." })
  .positive("Enter an amount greater than zero.")
  .max(1_000_000, "That amount is too large.")
  .refine((v) => Math.round(v * 100) === Math.round(v * 100 * 1e6) / 1e6, "Use at most 2 decimal places.")
  .transform((v) => Math.round(v * 100) / 100);

export const withdrawalSchema = z.object({ amount, methodId: z.string().uuid("Choose a payout account.") });
