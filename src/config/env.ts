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
});

if (COOKIE_SAMESITE === "none" && !COOKIE_SECURE) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const CORS_ORIGINS: string[] = Array.from(
  new Set(CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean))
);
