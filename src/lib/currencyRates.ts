import { CURRENCY_API_KEY } from "../config/env";
import { AppError } from "../middlewares/centralAppError";
import { getServiceLogger } from "../utils/loggerCreator";
import redis from "./redis/redis";

// Exchange rates from currencyapi.com, for converting a withdrawal into the
// payout account's currency. A missing rate blocks the payout rather than
// guessing one. Rates are cached briefly so a form being typed into doesn't
// call the provider on every keystroke.

const logger = getServiceLogger("currency-rates");
const CACHE_SECONDS = 10 * 60;

export interface Conversion {
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  convertedAmount: number;
}

async function rate(from: string, to: string): Promise<number> {
  const key = `fx:${from}:${to}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return Number(cached);

  if (!CURRENCY_API_KEY) {
    throw new AppError(`Payouts in ${to} aren't available right now. Choose a payout account in ${from}.`, 503, "FX_NOT_CONFIGURED");
  }
  const url = `https://api.currencyapi.com/v3/latest?base_currency=${from}&currencies=${to}`;
  const value = await fetch(url, { headers: { apikey: CURRENCY_API_KEY }, signal: AbortSignal.timeout(15_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((body: { data?: Record<string, { value?: number }> }) => body.data?.[to]?.value)
    .catch((err: Error) => {
      logger.error("Exchange rate lookup failed", { from, to, error: err.message });
      return undefined;
    });
  if (!value || !Number.isFinite(value) || value <= 0) {
    throw new AppError(`We couldn't get a current exchange rate for ${to}. Please try again shortly.`, 502, "FX_UNAVAILABLE");
  }
  await redis.set(key, String(value), "EX", CACHE_SECONDS).catch(() => undefined);
  return value;
}

/** `amount` in `from`, expressed in `to` (rounded to cents). */
export async function convert(amount: number, from: string, to: string): Promise<Conversion> {
  if (from === to) return { fromCurrency: from, toCurrency: to, exchangeRate: 1, convertedAmount: amount };
  const exchangeRate = await rate(from, to);
  return { fromCurrency: from, toCurrency: to, exchangeRate, convertedAmount: Math.round(amount * exchangeRate * 100) / 100 };
}
