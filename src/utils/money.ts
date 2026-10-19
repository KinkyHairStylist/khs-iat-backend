import { CURRENCY } from "../config/env";

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * An amount as customers read it, in the platform currency by default:
 * formatMoney(20) → "$20.00" for AUD. Accepts Prisma Decimals and the strings
 * Postgres returns for numeric columns.
 */
export function formatMoney(amount: number | string | { toString(): string }, currency: string = CURRENCY): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(Number(amount.toString()));
}
