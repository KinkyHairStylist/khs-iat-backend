import { airwallexEnabled, type Corridor } from "../../../lib/airwallex";
import { stripeConnectEnabled } from "../../../lib/stripe/connect";

// Where a salon's money can be paid out, by its business country. Mirrors
// lib/constants/payoutCountries.ts in the frontend.

/** Currencies a payout account can be in (the wallet ledger's own set). */
export const PAYOUT_CURRENCIES = ["USD", "EUR", "AUD", "GBP", "NGN"] as const;
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

const COUNTRY_CURRENCY: Record<string, PayoutCurrency> = { US: "USD", AU: "AUD", GB: "GBP", NG: "NGN", DE: "EUR", FR: "EUR", ES: "EUR", IE: "EUR" };

export type PayoutRail = "stripe" | "airwallex";

/** Stripe only works for Australian salons (KHS's Stripe account is Australian); the other payout countries use Airwallex. */
export function railForCountry(country: string | null | undefined): PayoutRail | null {
  if (!country || !COUNTRY_CURRENCY[country]) return null;
  return country === "AU" ? "stripe" : "airwallex";
}

/** The rail, only when it's switched on. */
export function availableRail(country: string | null | undefined): PayoutRail | null {
  const rail = railForCountry(country);
  if (rail === "stripe") return stripeConnectEnabled() ? rail : null;
  if (rail === "airwallex") return airwallexEnabled() ? rail : null;
  return null;
}

/**
 * The Airwallex corridor for a country. LOCAL is cheapest (often free); Nigeria
 * only has SWIFT, and only in USD (Airwallex has no NGN SWIFT schema).
 */
export function airwallexCorridor(country: string): Corridor {
  if (country === "NG") return { bankCountryCode: "NG", accountCurrency: "USD", transferMethod: "SWIFT" };
  return { bankCountryCode: country, accountCurrency: COUNTRY_CURRENCY[country], transferMethod: "LOCAL" };
}

// What Airwallex charged on real test transfers, shown as an estimate (it has
// no quote endpoint; the real fee is only known once a transfer exists).
// Corridors not listed show no estimate rather than a guess.
const AIRWALLEX_FEES: Record<string, { amount: number; currency: string }> = {
  NG_SWIFT: { amount: 14.1, currency: "USD" },
  US_LOCAL: { amount: 0, currency: "USD" },
  GB_LOCAL: { amount: 0, currency: "GBP" },
  DE_LOCAL: { amount: 0, currency: "EUR" },
  FR_LOCAL: { amount: 0, currency: "EUR" },
  ES_LOCAL: { amount: 0, currency: "EUR" },
  IE_LOCAL: { amount: 0, currency: "EUR" },
};

export const airwallexFeeEstimate = (country: string | null, method: string | null) => (country && method ? AIRWALLEX_FEES[`${country}_${method}`] : undefined);
