-- Launch offers (founding stylist + first-booking discount), 7 Nov 2026.
-- Run once per environment's database (IAT, SIT, UAT, PROD), before deploying the code that uses it.
-- Adds columns only: nothing is dropped or changed, and running it twice is harmless.
-- Then `npm run prisma:pull` (or keep the schema.prisma in this change) in khs-iat-backend and khs-iat-staff.

BEGIN;

-- When KHS approved the salon (the staff app sets it on approval from now on).
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS "approvedAt" timestamp(6) NULL;

-- 1 to 100 for the first salons approved: they get 0% commission for 2 months
-- (from launch, 1 Jan 2027, or their approval if later). NULL for everyone else.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS "foundingNumber" integer NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_businesses_foundingNumber" ON public.businesses ("foundingNumber");

-- The first-booking discount on a card payment. KHS covers it: the salon is paid as if it weren't there.
ALTER TABLE public.stripe_payment_intents ADD COLUMN IF NOT EXISTS "khsDiscountAmount" numeric(12, 2) NOT NULL DEFAULT 0;

-- Salons approved before this change: we don't know when they were approved, so use their last
-- update. Approved before launch either way, so their free months start on 1 Jan 2027 regardless.
UPDATE public.businesses
SET "approvedAt" = COALESCE("updatedAt", "createdAt")
WHERE status IN ('approved', 'suspended') AND "approvedAt" IS NULL;

-- Founding numbers for the salons already approved, oldest first, up to 100.
-- PROD: check the list first. Test or demo salons approved there would take real founding places.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "approvedAt", "createdAt", id) AS n
  FROM public.businesses
  WHERE status = 'approved' AND "foundingNumber" IS NULL
)
UPDATE public.businesses b
SET "foundingNumber" = r.n + COALESCE((SELECT MAX("foundingNumber") FROM public.businesses), 0)
FROM ranked r
WHERE b.id = r.id
  AND r.n + COALESCE((SELECT MAX("foundingNumber") FROM public.businesses), 0) <= 100;

COMMIT;

-- Check:
-- SELECT "foundingNumber", "businessName", "approvedAt" FROM public.businesses WHERE "foundingNumber" IS NOT NULL ORDER BY 1;
