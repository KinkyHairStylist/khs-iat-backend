import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import { PLATFORM_LEDGER_CURRENCY } from 'src/admin/payment/enums/wallet.enum';

export interface ConversionResult {
  ledgerCurrency: string;
  payoutCurrency: string;
  exchangeRate: number;
  payoutAmount: number;
}

// Reuses the same provider (currencyapi.com) the frontend already calls for
// AUD->NGN at customer checkout, generalized here to convert the platform's
// ledger currency into whatever payout currency a merchant has chosen. A
// failed lookup throws rather than falling back to a guessed rate — a
// withdrawal should be blocked, not misquoted.
@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);
  private readonly apiKey = process.env.CURRENCY_API_KEY;

  async convert(amount: number, targetCurrency: string): Promise<ConversionResult> {
    const ledgerCurrency = PLATFORM_LEDGER_CURRENCY as string;

    if (!targetCurrency || targetCurrency === ledgerCurrency) {
      return {
        ledgerCurrency,
        payoutCurrency: ledgerCurrency,
        exchangeRate: 1,
        payoutAmount: Math.round(amount * 100) / 100,
      };
    }

    if (!this.apiKey) {
      throw new BadRequestException(
        'Currency conversion is not configured — cannot preview or process a non-USD payout right now',
      );
    }

    try {
      const res = await axios.get('https://api.currencyapi.com/v3/latest', {
        params: {
          apikey: this.apiKey,
          base_currency: ledgerCurrency,
          currencies: targetCurrency,
        },
        timeout: 15000,
      });
      const rate = res.data?.data?.[targetCurrency]?.value;
      if (!rate || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`No rate returned for ${ledgerCurrency}->${targetCurrency}`);
      }
      const payoutAmount = Math.round(amount * rate * 100) / 100;
      return { ledgerCurrency, payoutCurrency: targetCurrency, exchangeRate: rate, payoutAmount };
    } catch (err) {
      this.logger.error(
        `Currency conversion ${ledgerCurrency}->${targetCurrency} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        `Could not get a current exchange rate for ${targetCurrency}. Try again shortly.`,
      );
    }
  }
}
