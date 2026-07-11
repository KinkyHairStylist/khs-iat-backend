# KHS IAT Backend

NestJS API server for the Kinky Hair Stylist (KHS) platform -- handles appointment booking, payments, user management, marketplace, and third-party integrations.

## Tech Stack

- **Framework:** NestJS v11, TypeScript
- **Database:** PostgreSQL (TypeORM), MongoDB (Mongoose, legacy)
- **Caching:** Redis (ioredis)
- **Auth:** Passport + JWT, bcrypt, argon2
- **Payments:** Stripe, PayPal, Paystack
- **Email:** SendGrid, Nodemailer, Mailchimp
- **SMS:** Twilio
- **Real-time:** Socket.IO
- **Integrations:** Google Calendar, Mailchimp, Zoho Books, QuickBooks
- **File Uploads:** Cloudinary, Multer
- **API Docs:** Swagger (`/api/docs`)

## Prerequisites

- Node.js 18+
- PostgreSQL
- Redis (optional, for caching)
- MongoDB (optional, legacy)

## Setup

```bash
cp .env.example .env    # Configure your environment variables
npm install
```

## Running

```bash
npm run start:dev       # Watch mode (development)
npm run build           # Build to dist/
npm run start           # Production start
npm run start:prod      # Production with 512MB heap
```

Server starts on **port 8080** with the `/api` prefix by default.

## Testing

```bash
npm run test            # Unit tests
npm run test:e2e        # End-to-end tests
npm run test:cov        # Coverage report
npm run lint            # ESLint
npm run format          # Prettier
```

## Scripts

Seed and maintenance scripts live in `scripts/`:

```bash
npm run seed:appointments
npm run seed:membership
# See package.json for the full list
```

## Project Structure

```
src/
  admin/              # Admin module (giftcards, payments, wallets, moderation, live-chat, settings)
  business/           # Business/partner module (clients, reminders, promotions, reviews, wallet)
  common/             # Shared utilities and guards
  config/             # DB config, env validation, Cloudinary, logger
  email/              # Email sending services
  helpers/            # Utility helpers
  integration/        # Third-party integrations (Google Calendar, Mailchimp, Zoho)
  landing/            # Landing page module
  marketplace/        # Marketplace module (inventory, products)
  payment/            # Payment processing
  user/               # User module (salon, booking, services, favorites, membership, referrals)
  webhook/            # PayPal & Paystack webhook handlers
```

## API Documentation

Swagger UI is available at `/api/docs` when the server is running.
