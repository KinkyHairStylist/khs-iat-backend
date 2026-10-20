import { AIRWALLEX_API_KEY, AIRWALLEX_BASE_URL, AIRWALLEX_CLIENT_ID, AIRWALLEX_ENABLED } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { getServiceLogger } from "../../utils/loggerCreator";

// Airwallex Payouts (Beneficiaries + Transfers) — the automatic payout rail for
// every payout country except Australia (Stripe Connect). A beneficiary is a
// bank-details record on KHS's own Airwallex account, usable as soon as it's
// created. A transfer is asynchronous: SCHEDULED → PROCESSING → SENT/PAID, or
// FAILED/CANCELLED, read back with retrieveTransfer.

const logger = getServiceLogger("airwallex");
const TIMEOUT_MS = 20_000;

export type TransferMethod = "LOCAL" | "SWIFT";

export interface FormSchemaField {
  enabled: boolean;
  /** Where the answer goes in the beneficiary-create body, e.g. "beneficiary.bank_details.account_number". */
  path: string;
  required: boolean;
  field: {
    key: string;
    label: string;
    placeholder?: string;
    tip?: string;
    default?: string;
    example?: string;
    options?: Array<{ label: string; value: string }>;
    type: "INPUT" | "SELECT" | "DYNAMIC_SELECT" | "RADIO" | "TRANSFER_METHOD";
  };
  rule?: { pattern?: string };
}

export interface FormSchema {
  fields: FormSchemaField[];
}

export interface Transfer {
  id: string;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED" | "PAID" | "CANCELLED";
  failure_type?: string;
}

export interface Corridor {
  accountCurrency: string;
  bankCountryCode: string;
  transferMethod: TransferMethod;
}

export const airwallexEnabled = (): boolean => AIRWALLEX_ENABLED;

let cachedToken: { token: string; expiresAt: number } | null = null;

function unavailable(): AppError {
  return new AppError("Airwallex payouts aren't available right now.", 503, "AIRWALLEX_NOT_CONFIGURED");
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; token?: string; headers?: Record<string, string> }): Promise<T> {
  const res = await fetch(`${AIRWALLEX_BASE_URL}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: Error) => {
    logger.error("Airwallex unreachable", { path, error: err.message });
    throw new AppError("We couldn't reach Airwallex. Please try again in a moment.", 502, "AIRWALLEX_ERROR");
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    logger.warn("Airwallex request failed", { path, status: res.status, message: data.message });
    // Their validation messages (a wrong account number, say) are meant for the person filling the form.
    throw new AppError(data.message || "Airwallex couldn't process this request.", res.status >= 500 ? 502 : 400, "AIRWALLEX_ERROR");
  }
  return data;
}

// Tokens last about 30 minutes; renewed 5 minutes early.
async function token(): Promise<string> {
  if (!AIRWALLEX_ENABLED) throw unavailable();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60_000) return cachedToken.token;
  const data = await call<{ token?: string; expires_at?: string }>("/api/v1/authentication/login", {
    method: "POST",
    body: {},
    headers: { "x-client-id": AIRWALLEX_CLIENT_ID, "x-api-key": AIRWALLEX_API_KEY },
  });
  if (!data.token) throw unavailable();
  cachedToken = { token: data.token, expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 25 * 60_000 };
  return data.token;
}

const authed = async <T>(method: "GET" | "POST", path: string, body?: unknown) => call<T>(path, { method, body, token: await token() });

/** The bank fields this corridor needs, as Airwallex describes them (so no per-country rules live here). */
export function getFormSchema(c: Corridor): Promise<FormSchema> {
  return authed<FormSchema>("POST", "/api/v1/beneficiary_form_schemas/generate", {
    account_currency: c.accountCurrency,
    bank_country_code: c.bankCountryCode,
    entity_type: "COMPANY",
    transfer_method: c.transferMethod,
  });
}

/** The fields the salon fills in: beneficiary details only (Airwallex works out the clearing system). */
export const beneficiaryFields = (schema: FormSchema) =>
  schema.fields.filter((f) => f.enabled !== false && f.path.startsWith("beneficiary") && f.field.type !== "TRANSFER_METHOD");

/**
 * Creates the salon's beneficiary. Answers are placed by the schema's own paths;
 * keys the schema doesn't know are dropped, so nothing else can be injected.
 */
export async function createBeneficiary(c: Corridor, answers: Record<string, string>): Promise<{ id: string; details: Record<string, string> }> {
  const schema = await getFormSchema(c);
  const fields = beneficiaryFields(schema);
  const missing = fields.filter((f) => f.required && !answers[f.field.key]?.trim());
  if (missing.length) throw AppError.badRequest(`Please fill in: ${missing.map((f) => f.field.label || f.field.key).join(", ")}.`, "MISSING_FIELDS");

  const body: Record<string, unknown> = { transfer_methods: [c.transferMethod] };
  const details: Record<string, string> = {};
  for (const f of fields) {
    const value = answers[f.field.key]?.trim();
    if (!value) continue;
    if (f.rule?.pattern && !new RegExp(f.rule.pattern).test(value)) throw AppError.badRequest(`Please check "${f.field.label}".`, "INVALID_FIELD");
    details[f.field.key] = value;
    const segments = f.path.split(".");
    let cursor = body;
    for (const segment of segments.slice(0, -1)) cursor = (cursor[segment] ??= {}) as Record<string, unknown>;
    cursor[segments[segments.length - 1]] = value;
  }
  const created = await authed<{ id: string }>("POST", "/api/v1/beneficiaries/create", body);
  return { id: created.id, details };
}

/**
 * Sends a payout. `requestId` is Airwallex's idempotency key — the withdrawal's
 * id, so a repeated click can never create a second transfer.
 */
export function createTransfer(t: {
  requestId: string; beneficiaryId: string; reference: string; transferMethod: TransferMethod;
  sourceCurrency: string; sourceAmount: number; transferCurrency: string;
}): Promise<Transfer> {
  return authed<Transfer>("POST", "/api/v1/transfers/create", {
    request_id: t.requestId,
    reason: "Merchant payout",
    reference: t.reference,
    beneficiary_id: t.beneficiaryId,
    source_currency: t.sourceCurrency,
    source_amount: t.sourceAmount.toFixed(2),
    transfer_currency: t.transferCurrency,
    transfer_method: t.transferMethod,
    // The salon carries any corridor fee, not KHS's balance.
    fee_paid_by: "BENEFICIARY",
  });
}

export const retrieveTransfer = (id: string) => authed<Transfer>("GET", `/api/v1/transfers/${encodeURIComponent(id)}`);
