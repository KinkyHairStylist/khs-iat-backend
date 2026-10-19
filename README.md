# khs-iat-customer-be

Customer API for Kinky Hair Stylist. Express 5 + Prisma 7 + Zod + Redis, with the
same structure as `khs-iat-staff-be` (itself structured like the golift backend):

```
src/
  config/        env.ts (envalid) and other config
  routes/        routes/index.ts mounts everything; customer routers in routes/customer
  controllers/   thin HTTP handlers (catchAsync + res.success)
  services/      business logic + Prisma queries (auth/ is split by job: accountAccess,
                 sessionService, signupService, passwordResetService)
  schemas/       Zod request schemas (parsed with utils/parseSchema)
  middlewares/   security, CSRF, errors, response envelope, docs
  lib/           prisma, redis and third-party clients
  emails/        email layout and templates (sent via lib/emailEngine)
  utils/         logger, jwt, auth cookies, rate limiting, helpers
  docs/          OpenAPI spec; paths in docs/paths/**/*.yaml
```

Customer modules are being moved here from `Kinky-Hair-Stylist-BE-Redesign`
(NestJS). The old backend keeps running until every module has moved.

## Modules

| Mounted at | What | Session |
|---|---|---|
| `/api/v1/auth` | Sign-up (email → code → details), login, refresh, logout, me, password reset (email → code → new password) | Public, except `/me` |
| `/api/v1/landing` | Landing page content (stats, testimonials, blog, FAQ, stories) and newsletter sign-up | Public |
| `/api/v1/salons` | Salon search, service types, locations, a salon's page, reviews, similar salons, its membership packages and gift cards for sale | Public |
| `/api/v1/alerts` | Platform alerts staff published for customers | Public |
| `/api/v1/notifications` | The customer's notifications (the bell): list, unread count, read, delete | Customer |
| `/api/v1/customer` | Favourites, preferences, review "helpful", memberships (owned, buy), gift cards (owned, validate, buy) | Customer |
| `/api/v1/bookings` | My appointments; book (holds the time 30 min); the booking; pay (card / deposit / gift card / membership / free), settle, leave without paying; cancel, reschedule / rebook, restore, confirm attendance, review | Customer |
| `/api/v1/support` | KHS Support chat: team list, conversations (tickets), messages | Customer |

## Support chat (live)

Customers chat with staff (who answer from `khs-iat-staff-fe`). This server runs a
socket.io endpoint (`/socket.io`, websocket only, authenticated by the session cookie,
allowed origins only) and the customer half of the chat bridge (`src/lib/chatBridge`):
customer messages, new/closed tickets and online status are published on
`khs:chat:khs-events`; staff replies, closes and staff status arrive on
`khs:chat:staff-events` and are delivered to that customer's sockets. Set
`CHAT_BRIDGE_REDIS_URL` to the same Redis as `khs-iat-staff-be`. The
Kinky-Hair-Stylist backend still serves merchant chat on the same channels.

## Bookings and payments

A booking is one Pending/Unpaid appointment per service under one order id,
created under a Postgres advisory lock per salon and day so two customers can't
take the same time. Prices always come from the database. Paying:

- **Card** (Stripe, in `CURRENCY`): `POST /bookings/:orderId/pay` starts a payment
  intent and records its ledger rows as pending; the browser completes it with
  Stripe Elements, then `POST /pay/complete` settles it (order Confirmed/Paid,
  payment `held` until the salon completes the appointment, gift card part taken
  off the card, one-time acquisition fee claimed). Settling is a single
  conditional update, so it happens once however many callers race.
- **Gift card covering everything**: confirmed at once; KHS's fees come out of
  the salon's wallet (it was paid when it sold the card).
- **Membership**: sessions from a membership the customer owns (one per
  appointment). The salon is paid per session minus commission, held 48 hours.
- **Free**: confirmed at once, no fees.

Buying a membership package or a gift card is a Stripe payment completed by
`.../purchase/complete` (safe to repeat; only the buyer can complete it). A gift
card is held for its first buyer for 30 minutes, its code is only ever shown to
the buyer, and if it was sold elsewhere meanwhile the payment is refunded.

Cancelling cancels the whole order (it was paid as one): at least the salon's
cancellation window before the appointment, the card payment is refunded minus
the platform's early-cancellation fee; inside it, nothing is refunded and the
salon keeps its share (platform setting) with KHS keeping the rest. Moving a
booking re-checks the slot and stylist like a new booking; a cancelled one that
comes back (rebook / restore) is held for payment again.

The Kinky-Hair-Stylist backend's Stripe webhook (`payment_intent.succeeded`)
still settles the same rows too, until it's moved off that backend.

## Shared database: read this first

This service uses the **same Postgres database** as `Kinky-Hair-Stylist-BE-Redesign`
(NestJS/TypeORM), and that backend owns the schema.

- `prisma/schema.prisma` is introspected: `npm run prisma:pull`, then `npm run prisma:generate`.
- **Never** run `prisma migrate` or `prisma db push` here. Schema changes go through the NestJS backend.

## Run locally

```
cp .env.example .env      # fill DATABASE_URL, JWT_SECRET, REDIS_URL
npm install
npm run prisma:pull && npm run prisma:generate
npm run dev               # http://localhost:4110, docs at /docs, health at /api/v1/health
```

## Auth & security

- Sessions are **httpOnly cookies only** — a 15-minute access JWT (`khs_customer_at`) and a
  rotating, single-use refresh token (`khs_customer_rt`, scoped to `/api/v1/auth`). No
  token ever appears in a response body. Same design as `khs-iat-staff-be`.
- Sessions live in Redis (`src/lib/redis/sessionStore.ts`, keys `customer-*`): logout and a
  password reset end them immediately; suspension takes effect on the next request.
  Reusing an old refresh token ends the whole session.
- Sign-up and reset codes (`src/lib/redis/codeStore.ts`) are 5 digits, stored only as an
  HMAC, valid 10 minutes, 5 attempts, one per minute per email. A verified code is
  exchanged for a single-use token that the next step must present — the last step
  can't be called without the code.
- Logins lock an account for 15 minutes after 10 failures, on top of per-IP limits.
  Wrong email and wrong password get the same answer; so do reset requests for
  unknown emails.
- Merchant and admin accounts are turned away (`NOT_CUSTOMER`) unless they are also customers.
- Emails carrying a code go to the customer only — never copied to `DELIVERY_TEAM_EMAIL`.
- CSRF: every write must send `X-Requested-With: khs-customer` and, from a browser,
  come from a `CORS_ORIGIN` origin — on top of `SameSite=Strict` cookies.
- In production cookies are `Secure` with the `__Secure-` prefix, and `/docs` is off
  unless `ENABLE_API_DOCS=true`. The customer app and API must be same-site (e.g.
  `kinkyhairstylists.com` and `api.kinkyhairstylists.com`) for `SameSite=Strict`;
  see `COOKIE_*` in `.env.example` otherwise.

## Porting a module from Kinky-Hair-Stylist-BE-Redesign

1. Add `src/schemas/customer/<module>.schema.ts` (Zod, replacing class-validator DTOs).
2. Add `src/services/customer/<module>Service.ts` (Prisma, replacing TypeORM repositories).
3. Add `src/controllers/customer/<module>Controller.ts` and `src/routes/customer/<module>Router.ts`.
4. Mount the router in `src/routes/index.ts` and document it in `src/docs/paths/customer/<module>.yaml`.
5. Add any new env vars to `src/config/env.ts` and `.env.example`. Business values (amounts,
   currency, limits) always come from config — never hard-coded. Money is shown with
   `utils/money.ts` (`formatMoney`, platform `CURRENCY`, default AUD).
6. Keep files short (about 200 lines at most): split a growing service by job, as in `services/auth/`.
7. Add unit tests for the schemas and helpers in `tests/` (they never touch the database).
8. `npm run typecheck && npm run lint && npm test` must pass.

`npm run build` runs `prisma generate` first, so a fresh deploy needs only `npm ci && npm run build`.
