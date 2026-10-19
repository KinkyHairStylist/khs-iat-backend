// ─── Base OpenAPI spec ────────────────────────────────────────────────────────
// Paths live in ./paths/*.yaml (one file per domain) and are merged in below —
// keeps this file from growing into one giant object as endpoints ship.
// Structure mirrors the golift backend's docs/index.ts.

import { load as parseYaml } from "js-yaml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACCESS_TOKEN_TTL_MINUTES } from "../config/env";
import { ACCESS_COOKIE } from "../utils/authCookies";

type PathsObject = Record<string, unknown>;

function importPaths(filename: string): PathsObject {
  const file = resolve(__dirname, "paths", filename);
  return (parseYaml(readFileSync(file, "utf8")) as PathsObject) ?? {};
}

const paths: PathsObject = {
  ...importPaths("system.yaml"),
  ...importPaths("auth.yaml"),

  // Customer — one file per domain under ./paths/customer.
  ...importPaths("customer/landing.yaml"),
  ...importPaths("customer/salons.yaml"),
  ...importPaths("customer/account.yaml"),
  ...importPaths("customer/bookings.yaml"),
  ...importPaths("customer/purchases.yaml"),
  ...importPaths("customer/profile.yaml"),
  ...importPaths("customer/settings.yaml"),
  ...importPaths("customer/billing.yaml"),
  ...importPaths("notifications.yaml"),
  ...importPaths("support.yaml"),
  ...importPaths("help.yaml"),

  // Merchant — one file per domain under ./paths/merchant.
  ...importPaths("merchant/auth.yaml"),
  ...importPaths("merchant/setup.yaml"),
  ...importPaths("merchant/dashboard.yaml"),
  ...importPaths("merchant/bookings.yaml"),
};

export const openApiSpec = {
  openapi: "3.0.3",

  info: {
    title: "KHS Customer API",
    version: "1.0.0",
    description: `
## Kinky Hair Stylist — Customer API

REST API powering the KHS customer site. Reads and writes the same Postgres
database as the main Kinky-Hair-Stylist backend.

### Authentication
Sessions are **httpOnly cookies** set by \`POST /api/v1/auth/login\` — tokens are never
returned in a response body. The access cookie lasts ${ACCESS_TOKEN_TTL_MINUTES} minutes; on
\`401 TOKEN_MISSING\` (the browser dropped the expired cookie) or \`401 TOKEN_EXPIRED\` call \`POST /api/v1/auth/refresh\` (rotates the refresh cookie) and retry.

### CSRF
Every \`POST\`/\`PUT\`/\`PATCH\`/\`DELETE\` must send \`X-Requested-With: khs-customer\`
(Swagger adds it for you) and, from a browser, come from an allowed origin.

### Response Envelope
Every response follows the same shape:

**Success**
\`\`\`json
{ "success": true,  "message": "OK", "data": {}, "timestamp": "...", "requestId": "..." }
\`\`\`
**Error**
\`\`\`json
{ "success": false, "code": "NOT_FOUND", "message": "...", "timestamp": "...", "requestId": "..." }
\`\`\`

### Error Codes
| Code | HTTP | Meaning |
|---|---|---|
| \`BAD_REQUEST\` | 400 | Malformed body or invalid field values |
| \`UNAUTHORIZED\` | 401 | Not logged in |
| \`TOKEN_MISSING\` | 401 | No access cookie (it expired and the browser dropped it) — call /auth/refresh, then retry |
| \`TOKEN_EXPIRED\` | 401 | Access cookie expired — call /auth/refresh, then retry |
| \`SESSION_REVOKED\` | 401 | Session ended (logout, password change, suspension) — log in again |
| \`FORBIDDEN\` | 403 | Logged in, but not allowed to do this |
| \`CSRF_REJECTED\` | 403 | Missing X-Requested-With header, or request from a foreign origin |
| \`ACCOUNT_LOCKED\` | 429 | Too many failed sign-ins for this account — wait, or reset the password |
| \`NOT_FOUND\` | 404 | Resource does not exist |
| \`CONFLICT\` | 409 | Unique constraint violated |
| \`RATE_LIMITED\` | 429 | Too many requests |
| \`SERVICE_UNAVAILABLE\` | 503 | Database temporarily unreachable |
| \`INTERNAL_ERROR\` | 500 | Unexpected server error |
    `.trim(),
    contact: {
      name: "Kinky Hair Stylist",
    },
    license: {
      name: "Proprietary",
    },
  },

  servers: [
    {
      url: "http://localhost:{port}",
      description: "Local development",
      variables: {
        port: { default: "4110", description: "PORT from .env" },
      },
    },
  ],

  security: [{ CookieAuth: [] }],

  tags: [
    { name: "System", description: "Health and readiness probes" },
    { name: "Auth", description: "Customer sign-up, sessions and password reset" },
    { name: "Landing", description: "The landing page's public content and newsletter sign-up" },
    { name: "Salons", description: "Public salon search" },
    { name: "Account", description: "Platform alerts, and the signed-in customer's favourites and preferences" },
    { name: "Notifications", description: "The signed-in customer's notifications (the bell)" },
    { name: "Support", description: "KHS Support chat with the team (live updates over socket.io)" },
  ],

  components: {
    securitySchemes: {
      CookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: ACCESS_COOKIE,
        description: "httpOnly session cookie set by POST /api/v1/auth/login",
      },
    },

    parameters: {
      RequestId: {
        in: "header",
        name: "X-Request-ID",
        schema: { type: "string", format: "uuid" },
        description: "Idempotency / tracing ID. Auto-generated if omitted.",
      },
      PageParam: {
        in: "query",
        name: "page",
        schema: { type: "integer", minimum: 1, default: 1 },
        description: "Page number (1-based)",
      },
      LimitParam: {
        in: "query",
        name: "limit",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        description: "Items per page",
      },
    },

    schemas: {
      SuccessEnvelope: {
        type: "object",
        required: ["success", "message", "data", "timestamp"],
        properties: {
          success:   { type: "boolean", example: true },
          message:   { type: "string",  example: "Success" },
          data:      { description: "Payload — shape varies per endpoint" },
          timestamp: { type: "string",  format: "date-time" },
          requestId: { type: "string",  format: "uuid" },
        },
      },

      ErrorEnvelope: {
        type: "object",
        required: ["success", "code", "message", "timestamp"],
        properties: {
          success:   { type: "boolean", example: false },
          code:      { type: "string",  example: "NOT_FOUND" },
          message:   { type: "string",  example: "Resource not found" },
          timestamp: { type: "string",  format: "date-time" },
          requestId: { type: "string",  format: "uuid" },
        },
      },

      PaginationMeta: {
        type: "object",
        required: ["total", "page", "limit", "totalPages"],
        properties: {
          total:      { type: "integer", example: 200 },
          page:       { type: "integer", example: 1 },
          limit:      { type: "integer", example: 20 },
          totalPages: { type: "integer", example: 10 },
        },
      },
    },
  },

  paths,
};
