import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';

export interface AirwallexFormSchemaField {
  enabled: boolean;
  path: string; // dot-path into the nested beneficiary-create body, e.g.
                 // "beneficiary.bank_details.account_number"
  required: boolean;
  field: {
    key: string;
    label: string;
    placeholder?: string;
    description?: string;
    tip?: string;
    default?: string;
    example?: string;
    options?: { label: string; value: string }[];
    // Confirmed live: this is where the real API actually puts the
    // field's UI type — nested under `field`, not a sibling of `path`/
    // `required` as this interface originally (wrongly) declared. Unused
    // by buildBeneficiaryBody's own logic (it only reads `.path` and
    // `.field.key`), so this mismatch never broke anything server-side —
    // but it fooled the frontend's matching type into always rendering
    // every field as a plain text input, including fixed-value SELECT
    // fields like Nigeria's `state` (needs the ISO code "NG-LA", not a
    // free-typed label). Fixed there too.
    type: 'INPUT' | 'SELECT' | 'DYNAMIC_SELECT' | 'RADIO' | 'TRANSFER_METHOD';
  };
  rule?: { type?: string; pattern?: string };
}

export interface AirwallexFormSchema {
  condition: Record<string, string>;
  fields: AirwallexFormSchemaField[];
  key: string;
}

export interface AirwallexBeneficiary {
  id: string;
  beneficiary: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AirwallexTransfer {
  id: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'PAID' | 'CANCELLED';
  fee_amount?: number;
  fee_currency?: string;
  amount_beneficiary_receives?: number;
  amount_payer_pays?: number;
  [key: string]: unknown;
}

/**
 * Airwallex's "Payouts" product (Beneficiaries + Transfers), the second
 * automatic-payout rail alongside Stripe Connect — for every payout country
 * this platform supports EXCEPT Australia (which uses Stripe instead).
 *
 * Architecturally different from Stripe Connect in ways that shape this
 * whole class: there is no per-merchant sub-account to onboard (a
 * Beneficiary is just a bank-details record on KHS's own Airwallex account,
 * usable the instant it's created — see createBeneficiary), and a
 * successful transfer create call is NOT final (Airwallex transfers are
 * genuinely async: SCHEDULED -> PROCESSING -> SENT/FAILED/PAID/CANCELLED,
 * confirmed live against the sandbox — see retrieveTransfer, the manual
 * refresh fallback this first version relies on since the real webhook
 * event name isn't confirmed yet).
 */
@Injectable()
export class AirwallexService {
  private readonly logger = new Logger(AirwallexService.name);
  private readonly clientId = process.env.AIRWALLEX_CLIENT_ID;
  private readonly apiKey = process.env.AIRWALLEX_API_KEY;
  // Sandbox by default — must be overridden to the production base URL once
  // real (non-sandbox) credentials replace these, or the platform silently
  // keeps talking to the sandbox indefinitely.
  private readonly baseUrl =
    process.env.AIRWALLEX_BASE_URL || 'https://api-demo.airwallex.com';
  private readonly webhookSecret = process.env.AIRWALLEX_WEBHOOK_SECRET;

  constructor() {
    if (!this.clientId || !this.apiKey) {
      throw new Error('AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY must be set');
    }
  }

  /**
   * Verifies a webhook request per Airwallex's documented scheme (x-timestamp
   * + x-signature headers, HMAC-SHA256 of `timestamp + rawBody` keyed by the
   * notification URL's own secret, hex digest) — this exact scheme is not
   * yet confirmed against a real delivered webhook (no event has been
   * received in this app yet), only against Airwallex's own published docs,
   * unlike everything else in this class which was validated live. Flag for
   * re-confirmation the first time a real webhook actually arrives. Throws
   * on a missing secret/headers or a mismatch — callers should treat that
   * the same way an invalid Stripe signature is treated (acknowledge with
   * 200 so the sender doesn't retry-storm, but don't process the payload).
   */
  verifyWebhookSignature(rawBody: Buffer, timestamp: string, signature: string): void {
    if (!this.webhookSecret) {
      throw new Error('AIRWALLEX_WEBHOOK_SECRET must be set');
    }
    if (!timestamp || !signature) {
      throw new Error('Missing x-timestamp/x-signature headers');
    }
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');
    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error('Signature mismatch');
    }
  }

  private cachedToken: { token: string; expiresAt: number } | null = null;

  // Observed ~30min expiry in sandbox testing (2026-09-29: issued at 07:17,
  // expires_at 07:48). Refreshed 5 minutes early so an in-flight request
  // never straddles expiry.
  private async getToken(): Promise<string> {
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt > Date.now() + 5 * 60_000
    ) {
      return this.cachedToken.token;
    }
    try {
      const res = await axios.post(
        `${this.baseUrl}/api/v1/authentication/login`,
        {},
        {
          headers: { 'x-client-id': this.clientId, 'x-api-key': this.apiKey },
          timeout: 15000,
        },
      );
      const token: string = res.data?.token;
      if (!token) throw new Error('no token in response');
      const expiresAt = res.data?.expires_at
        ? new Date(res.data.expires_at).getTime()
        : Date.now() + 25 * 60_000; // conservative fallback if the field is absent/renamed
      this.cachedToken = { token, expiresAt };
      return token;
    } catch (error) {
      throw new BadRequestException(
        `Unable to authenticate with Airwallex: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    const axiosError = error as AxiosError<{ message?: string }>;
    return axiosError?.response?.data?.message || (error as Error)?.message || 'unknown error';
  }

  private async authedRequest<T>(
    method: 'get' | 'post',
    path: string,
    data?: unknown,
  ): Promise<T> {
    const token = await this.getToken();
    try {
      const res = await axios.request<T>({
        method,
        url: `${this.baseUrl}${path}`,
        data,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });
      return res.data;
    } catch (error) {
      throw new BadRequestException(
        `Airwallex request to ${path} failed: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * The dynamic, per-corridor required-field list — Airwallex's own
   * recommended mechanism (confirmed live), so this app never hardcodes
   * per-country bank-field requirements. Each field's `path` says exactly
   * where its answer belongs in createBeneficiary's nested body — see
   * buildBeneficiaryBody below, which uses this same call's output to do
   * that mapping rather than trusting a client-supplied nested shape.
   */
  async getFormSchema(params: {
    accountCurrency: string;
    bankCountryCode: string;
    entityType: 'COMPANY' | 'PERSONAL';
    transferMethod: 'LOCAL' | 'SWIFT';
    localClearingSystem?: string;
  }): Promise<AirwallexFormSchema> {
    return this.authedRequest<AirwallexFormSchema>(
      'post',
      '/api/v1/beneficiary_form_schemas/generate',
      {
        account_currency: params.accountCurrency,
        bank_country_code: params.bankCountryCode,
        entity_type: params.entityType,
        transfer_method: params.transferMethod,
        ...(params.localClearingSystem
          ? { local_clearing_system: params.localClearingSystem }
          : {}),
      },
    );
  }

  /**
   * Turns a flat { fieldKey: value } map (what the frontend's simple
   * field-type renderer submits) into the nested body beneficiaries/create
   * expects, using the same form schema's `path`s as the map from key to
   * nested location — confirmed live, e.g. "account_number" maps to
   * "beneficiary.bank_details.account_number". transfer_method and nickname
   * are the only top-level (non-"beneficiary.*") paths seen in testing.
   */
  private buildBeneficiaryBody(
    schema: AirwallexFormSchema,
    answers: Record<string, unknown>,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const value = answers[field.field.key];
      if (value === undefined || value === null || value === '') continue;
      const segments = field.path.split('.');
      let cursor = body;
      for (let i = 0; i < segments.length - 1; i++) {
        cursor[segments[i]] = cursor[segments[i]] ?? {};
        cursor = cursor[segments[i]] as Record<string, unknown>;
      }
      cursor[segments[segments.length - 1]] = value;
    }
    return body;
  }

  /**
   * Creates a Beneficiary on KHS's own Airwallex account — this IS the
   * "onboarding" for this rail; there's no separate enable step to wait on
   * afterward, unlike Stripe Connect's hosted onboarding + webhook.
   */
  async createBeneficiary(params: {
    accountCurrency: string;
    bankCountryCode: string;
    entityType: 'COMPANY';
    transferMethod: 'LOCAL' | 'SWIFT';
    localClearingSystem?: string;
    answers: Record<string, unknown>;
  }): Promise<AirwallexBeneficiary> {
    const schema = await this.getFormSchema(params);
    const missing = schema.fields.filter(
      (f) =>
        f.required &&
        f.path.startsWith('beneficiary') &&
        (params.answers[f.field.key] === undefined ||
          params.answers[f.field.key] === ''),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.map((f) => f.field.label || f.field.key).join(', ')}`,
      );
    }
    const body = this.buildBeneficiaryBody(schema, params.answers);
    // Required at the top level, but never collected as a user-editable
    // form field — the merchant doesn't pick their own transfer method, the
    // corridor implies it (see defaultAirwallexTransferMethod on the
    // frontend), so buildBeneficiaryBody's flat-answers mapping never
    // produces it on its own. Confirmed live: the real API rejects a
    // beneficiary-create body missing this with a validation error on
    // "transfer_methods" — and it's the plural, array-shaped field name,
    // not the singular "transfer_method" the form schema's own field path
    // uses (that field is about which schema to fetch, not the create
    // body's real shape).
    body.transfer_methods = [params.transferMethod];
    return this.authedRequest<AirwallexBeneficiary>(
      'post',
      '/api/v1/beneficiaries/create',
      body,
    );
  }

  /**
   * Fires an Airwallex transfer to a previously-created Beneficiary. The
   * response is only "accepted" (see class doc) — status resolution needs
   * retrieveTransfer (manual refresh, for now) or, later, a webhook.
   * requestId is the caller's idempotency key; the caller should pass a
   * stable value per real attempt (the Withdrawal's own id is used by
   * BusinessWalletService.claimAutomaticPayout).
   */
  async createTransfer(params: {
    amount: number; // major units, e.g. 10.00 — NOT smallest-currency-unit
                     // like Stripe's createTransfer convention
    sourceCurrency: string;
    transferCurrency: string;
    beneficiaryId: string;
    transferMethod: 'LOCAL' | 'SWIFT';
    feePaidBy: 'PAYER' | 'BENEFICIARY';
    reference: string;
    requestId: string;
  }): Promise<AirwallexTransfer> {
    if (!(params.amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    return this.authedRequest<AirwallexTransfer>(
      'post',
      '/api/v1/transfers/create',
      {
        request_id: params.requestId,
        reason: 'Merchant payout',
        reference: params.reference,
        beneficiary_id: params.beneficiaryId,
        source_currency: params.sourceCurrency,
        transfer_currency: params.transferCurrency,
        source_amount: params.amount.toFixed(2),
        transfer_method: params.transferMethod,
        fee_paid_by: params.feePaidBy,
      },
    );
  }

  /**
   * On-demand status read — the ONLY confirmation path in this first
   * version (no webhook wired yet, see AirwallexService's class doc and the
   * plan's "ship with manual refresh first" decision). Same role as
   * StripeService.retrieveConnectedAccount.
   */
  async retrieveTransfer(transferId: string): Promise<AirwallexTransfer> {
    return this.authedRequest<AirwallexTransfer>(
      'get',
      `/api/v1/transfers/${transferId}`,
    );
  }
}
