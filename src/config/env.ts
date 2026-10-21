import "dotenv/config";
import { cleanEnv, str, port, num, bool, url, makeValidator } from "envalid";

// Signs session tokens — must be long and random. Generate with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
const secret = makeValidator((value: string) => {
  if (value.length < 32) throw new Error("must be at least 32 characters");
  return value;
});

// Integration settings (Stripe, Firebase, Slack, ...) are added here as the
// customer modules that need them are ported from Kinky-Hair-Stylist-BE-Redesign.
// Three upper-case letters, e.g. AUD.
const currency = makeValidator((value: string) => {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("must be a 3-letter ISO 4217 currency code, e.g. AUD");
  return code;
});

// A money amount above zero with at most 2 decimal places.
const timeZone = makeValidator((value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new Error(`must be an IANA time zone such as Australia/Sydney (got "${value}")`);
  }
  return value;
});

const positiveAmount = makeValidator((value: string | number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    throw new Error("must be an amount above 0 with at most 2 decimal places");
  }
  return amount;
});

export const {
  NODE_ENV,
  PORT,
  WEB_CONCURRENCY,
  DATABASE_URL,
  JWT_SECRET,
  ACCESS_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  COOKIE_DOMAIN,
  COOKIE_SAMESITE,
  COOKIE_SECURE,
  LOG_LEVEL,
  CORS_ORIGIN,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  REDIS_URL,
  ENABLE_API_DOCS,
  // App URLs (used in email links)
  CUSTOMER_APP_URL,
  MERCHANT_APP_URL,
  // SendGrid (email)
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SENDGRID_FROM_NAME,
  CLIENT_MESSAGES_PER_DAY,
  DELIVERY_TEAM_EMAIL,
  SUPPORT_EMAIL,
  // Slack alerts
  SLACK_USERS_TOKEN,
  SLACK_CHANNEL_ID,
  APP_ENV,
  // Money
  CURRENCY,
  REFERRAL_REWARD_AMOUNT,
  // Support chat
  CHAT_BRIDGE_REDIS_URL,
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_STORAGE_BUCKET,
  // Payments
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  // Merchant payouts
  STRIPE_CONNECT_ENABLED,
  AIRWALLEX_ENABLED,
  AIRWALLEX_CLIENT_ID,
  AIRWALLEX_API_KEY,
  AIRWALLEX_BASE_URL,
  CURRENCY_API_KEY,
  AIRWALLEX_WEBHOOK_SECRET,
  // Scheduled jobs
  JOBS_ENABLED,
  PLATFORM_TIME_ZONE,
  // Salon integrations
  SETTINGS_ENCRYPTION_KEY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_LOGIN_REDIRECT_URI,
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URI,
} = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "production", "test"],
    default: "development",
  }),

  PORT: port({ default: 4110 }),

  // Cluster fork count. Defaults to 1 (no clustering) — safe for containerized
  // PaaS deployments, where os.cpus() reports the HOST's core count and
  // horizontal scaling is meant to happen via replicas.
  WEB_CONCURRENCY: num({ default: 1 }),

  // The SAME Postgres database the Kinky-Hair-Stylist (NestJS) backend uses.
  // That backend owns the schema — this service never runs migrations.
  DATABASE_URL: str({
    docs: "postgresql://user:password@host:5432/khs?sslmode=require",
  }),

  JWT_SECRET: secret({ docs: "Signs customer access tokens. At least 32 random characters" }),

  // ─── Sessions ────────────────────────────────────────────────────────────────
  // Tokens live only in httpOnly cookies — never in the response body or JS.
  // The short-lived access token is refreshed silently with a rotating,
  // single-use refresh token.
  ACCESS_TOKEN_TTL_MINUTES: num({ default: 15 }),
  REFRESH_TOKEN_TTL_DAYS: num({ default: 7 }),
  // Leave empty (host-only cookies) when the customer app and API share a host;
  // set to the parent domain (e.g. ".kinkyhairstylists.com") otherwise.
  COOKIE_DOMAIN: str({ default: "" }),
  // "strict" works whenever the customer app and API are same-site (same
  // registrable domain, any subdomain/port). Use "none" only for a cross-site
  // deployment — it requires COOKIE_SECURE=true.
  COOKIE_SAMESITE: str({ choices: ["strict", "lax", "none"], default: "strict" }),
  COOKIE_SECURE: bool({ default: true, devDefault: false }),

  LOG_LEVEL: str({
    choices: ["debug", "info", "warn", "error"],
    default: "info",
  }),

  CORS_ORIGIN: str({ default: "http://localhost:3000" }),

  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX: num({ default: 300 }),

  REDIS_URL: str({
    docs: "redis://localhost:6379 (local) or rediss://:TOKEN@host:6379 (TLS provider)",
  }),

  // Swagger UI + spec.json at /docs. Off in production unless explicitly enabled.
  ENABLE_API_DOCS: bool({ default: false, devDefault: true }),

  // ─── App URLs ────────────────────────────────────────────────────────────────
  // Full address (with http:// or https://): it goes into email links. Each
  // environment (IAT, SIT, UAT, production) sets its own.
  CUSTOMER_APP_URL: url({ default: "http://localhost:3000", docs: "Origin of khs-iat-customer-fe" }),
  // The salons' dashboard, linked from the "new booking" email sent to a salon.
  MERCHANT_APP_URL: url({ default: "http://localhost:3005", docs: "Origin of the merchant (salon) dashboard" }),

  // ─── SendGrid ────────────────────────────────────────────────────────────────
  // Same account and sender as the Kinky-Hair-Stylist backend.
  SENDGRID_API_KEY: str({ default: "", docs: "SendGrid API key" }),
  SENDGRID_FROM_EMAIL: str({ default: "", docs: "Verified sender address in SendGrid" }),
  SENDGRID_FROM_NAME: str({ default: "Kinky Hair Stylist" }),
  CLIENT_MESSAGES_PER_DAY: num({ default: 500, docs: "How many client emails one salon can send a day (messages, reminders, promotions)" }),
  // Told about every new customer, and copied on welcome emails. Never copied
  // on anything carrying a code. Empty = no team emails.
  DELIVERY_TEAM_EMAIL: str({ default: "", docs: "KHS team mailbox. Leave empty for none" }),

  SUPPORT_EMAIL: str({ default: "support@kinkyhairstylists.com", docs: "Support address for this environment" }),

  // ─── Slack ───────────────────────────────────────────────────────────────────
  // New-customer alerts. Unset SLACK_CHANNEL_ID = alerts are skipped.
  SLACK_USERS_TOKEN: str({ default: "", docs: "Bot token with chat:write" }),
  SLACK_CHANNEL_ID: str({ default: "", docs: "Channel ID (C...) alerts are posted to" }),
  APP_ENV: str({ default: "", docs: "Label put in front of each alert, e.g. iat, uat, prod" }),

  // ─── Money ───────────────────────────────────────────────────────────────────
  // The platform's currency (ISO 4217) — every amount shown to a customer is
  // formatted in it (utils/money.ts).
  CURRENCY: currency({ default: "AUD", docs: "ISO 4217 code, e.g. AUD" }),
  // What a referrer earns, in CURRENCY, when someone they referred signs up.
  REFERRAL_REWARD_AMOUNT: positiveAmount({ default: 20, docs: "Referral reward in CURRENCY" }),

  // ─── Support chat ────────────────────────────────────────────────────────────
  // The Redis khs-iat-staff-be's chat bridge uses (its CHAT_BRIDGE_REDIS_URL):
  // customer messages go to staff on it, staff replies come back on it.
  // Empty = REDIS_URL.
  CHAT_BRIDGE_REDIS_URL: str({ default: "" }),
  // Firebase Storage for chat images — the same bucket as the staff backend.
  // Empty = customers can send text only (images answer 503).
  FIREBASE_PROJECT_ID: str({ default: "" }),
  FIREBASE_CLIENT_EMAIL: str({ default: "", docs: "Service account email" }),
  FIREBASE_PRIVATE_KEY: str({ default: "", docs: "Service account private key; \\n escapes are accepted" }),
  FIREBASE_STORAGE_BUCKET: str({ default: "", docs: "Defaults to <project>.appspot.com" }),

  // ─── Stripe ──────────────────────────────────────────────────────────────────
  // The same Stripe account as the Kinky-Hair-Stylist backend: booking payments
  // are charged in CURRENCY. Empty = card payments answer 503.
  STRIPE_SECRET_KEY: str({ default: "", docs: "sk_test_... or sk_live_..." }),
  // Signing secret of the Stripe webhook endpoint pointed at POST /api/v1/webhooks/stripe.
  // Empty = that endpoint refuses every event.
  STRIPE_WEBHOOK_SECRET: str({ default: "", docs: "whsec_..." }),

  // ─── Merchant payouts ────────────────────────────────────────────────────────
  // Salons withdraw their wallet balance. Every request is reviewed by KHS; once
  // approved, a salon with a connected Stripe (Australia) or Airwallex (other
  // payout countries) account sends it to itself, otherwise KHS pays by hand.
  STRIPE_CONNECT_ENABLED: bool({ default: false, docs: "Lets Australian salons connect a Stripe Express payout account" }),
  AIRWALLEX_ENABLED: bool({ default: false, docs: "Lets salons in the other payout countries connect an Airwallex beneficiary" }),
  AIRWALLEX_CLIENT_ID: str({ default: "" }),
  AIRWALLEX_API_KEY: str({ default: "" }),
  AIRWALLEX_BASE_URL: url({ default: "https://api-demo.airwallex.com", docs: "https://api.airwallex.com in production" }),
  // currencyapi.com — converts a withdrawal into the payout account's currency.
  // Empty = only payouts in the wallet's own currency are possible.
  CURRENCY_API_KEY: str({ default: "" }),
  // Airwallex webhook (POST /api/v1/webhooks/airwallex) secret. Empty = events refused;
  // Submitted payouts are then confirmed by the salon's "Refresh status".
  AIRWALLEX_WEBHOOK_SECRET: str({ default: "" }),

  // ─── Scheduled jobs ─────────────────────────────────────────────────────────
  // Wallet release, plan trial/grace sweep, prepaid expiry and "service started"
  // notices. Each run happens once across every worker and server (Redis). Keep
  // false while the Kinky-Hair-Stylist backend still runs the same crons.
  JOBS_ENABLED: bool({ default: false, docs: "Run the scheduled jobs on this server" }),
  // When the daily jobs run (01:00 here), and the clock appointment times are
  // read in for a customer who hasn't chosen a time zone.
  PLATFORM_TIME_ZONE: timeZone({ default: "Australia/Sydney", docs: "IANA time zone" }),

  // ─── Salon integrations (Settings → Integrations) ───────────────────────────
  // Each salon connects its own Google Calendar, Mailchimp and ZohoBooks; their
  // tokens and keys are stored encrypted with this key (AES-256-GCM, the same
  // format and variable as the Kinky-Hair-Stylist backend). Empty = integrations off.
  SETTINGS_ENCRYPTION_KEY: str({ default: "", docs: "base64 of 32 random bytes: openssl rand -base64 32" }),
  // KHS's OAuth apps. Empty = that integration shows as unavailable. The redirect
  // URI (default: the merchant Settings → Integrations page) must be registered
  // with the provider exactly as it resolves.
  GOOGLE_CLIENT_ID: str({ default: "" }),
  GOOGLE_CLIENT_SECRET: str({ default: "" }),
  GOOGLE_REDIRECT_URI: str({ default: "", docs: "Default MERCHANT_APP_URL/merchant/dashboard/settings?tab=integrations" }),
  // "Continue with Google" on /auth uses the same OAuth client; Google returns to this backend.
  GOOGLE_LOGIN_REDIRECT_URI: str({ default: "", docs: "Default http://localhost:PORT/api/v1/auth/google/callback; register it in Google Cloud" }),
  ZOHO_CLIENT_ID: str({ default: "" }),
  ZOHO_CLIENT_SECRET: str({ default: "" }),
  ZOHO_REDIRECT_URI: str({ default: "", docs: "Default MERCHANT_APP_URL/merchant/dashboard/settings?tab=integrations&type=zohobooks" }),
});

if (SETTINGS_ENCRYPTION_KEY && Buffer.from(SETTINGS_ENCRYPTION_KEY, "base64").length !== 32) {
  throw new Error("SETTINGS_ENCRYPTION_KEY must be base64 of exactly 32 bytes (openssl rand -base64 32)");
}

if (AIRWALLEX_ENABLED && (!AIRWALLEX_CLIENT_ID || !AIRWALLEX_API_KEY)) {
  throw new Error("AIRWALLEX_ENABLED=true requires AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY");
}

if (COOKIE_SAMESITE === "none" && !COOKIE_SECURE) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const CORS_ORIGINS: string[] = Array.from(
  new Set(CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean))
);
