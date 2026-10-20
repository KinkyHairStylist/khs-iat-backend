import { geocodeAddress } from "../../../lib/geocode";
import { businessImageUrlPrefix, deleteBusinessImages, uploadBusinessImage } from "../../../lib/firebase/storage";
import prisma, { WRITE_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import { requireMerchantBusiness } from "../merchantBusiness";

// Settings > Business: the salon's name, description, revenue goal, opening
// hours, address and photo gallery. Only the salon's own fields are returned
// (the old profile sent the owner's full account, password hash included).

const MAX_GALLERY = 4;
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const asTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const gallery = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string") : []);

export async function getBusinessProfile(userId: string) {
  const { id } = await requireMerchantBusiness(userId);
  const b = await prisma.businesses.findUniqueOrThrow({
    where: { id },
    select: {
      id: true, businessName: true, description: true, revenueGoal: true, businessAddress: true, country: true, latitude: true, longitude: true, businessImage: true, status: true,
      booking_days: { select: { day: true, isOpen: true, startTime: true, endTime: true } },
    },
  });
  const days = new Map(b.booking_days.map((d) => [d.day, d]));
  return {
    id: b.id,
    businessName: b.businessName,
    description: b.description,
    revenueGoal: b.revenueGoal !== null ? Number(b.revenueGoal) : null,
    businessAddress: b.businessAddress,
    country: b.country,
    hasMapPin: b.latitude !== null && b.longitude !== null,
    gallery: gallery(b.businessImage),
    // Always the full week, Sunday first (missing days show as closed 09:00–17:00).
    bookingDays: WEEK.map((day) => {
      const d = days.get(day);
      return { day, isOpen: d?.isOpen ?? false, startTime: d ? hhmm(d.startTime) : "09:00", endTime: d ? hhmm(d.endTime) : "17:00" };
    }),
  };
}

export async function updateBusinessInfo(userId: string, input: { businessName: string; description: string; revenueGoal?: number | null }) {
  const { id } = await requireMerchantBusiness(userId);
  await prisma.businesses.update({
    where: { id },
    data: { businessName: input.businessName, description: input.description, ...(input.revenueGoal !== undefined ? { revenueGoal: input.revenueGoal } : {}), updatedAt: new Date() },
  });
  return getBusinessProfile(userId);
}

/** Replaces the week's opening hours in one transaction (the booking calendar reads them straight away). */
export async function updateBusinessHours(userId: string, days: Array<{ day: string; isOpen: boolean; startTime: string; endTime: string }>) {
  const { id } = await requireMerchantBusiness(userId);
  await prisma.$transaction(async (tx) => {
    await tx.booking_days.deleteMany({ where: { businessId: id } });
    await tx.booking_days.createMany({ data: days.map((d) => ({ businessId: id, day: d.day, isOpen: d.isOpen, startTime: asTime(d.startTime), endTime: asTime(d.endTime) })) });
  }, WRITE_TX_OPTIONS);
  return getBusinessProfile(userId);
}

/**
 * New address (and country). The map pin follows the address when it can be
 * found; otherwise the address is saved and `mapPinUpdated` says it wasn't.
 * The country decides the payout rail, so it can't change while a connected
 * payout account or a withdrawal is tied to the current one.
 */
export async function updateBusinessLocation(userId: string, input: { businessAddress: string; country?: string }) {
  const { id } = await requireMerchantBusiness(userId);
  const current = await prisma.businesses.findUniqueOrThrow({ where: { id }, select: { businessAddress: true, country: true } });
  const country = input.country ?? current.country;

  if (input.country && input.country !== current.country) {
    const [connected, openWithdrawals] = await Promise.all([
      prisma.wallet_payment_methods.count({ where: { isActive: true, type: { in: ["stripe_connect", "airwallex_connect"] }, business_wallets: { businessId: id } } }),
      prisma.withdrawals.count({ where: { businessId: id, status: { in: ["Pending", "Processing", "Submitted"] } } }),
    ]);
    if (connected || openWithdrawals) {
      throw AppError.conflict("Your country can't change while a connected payout account or a withdrawal is set up for it. Remove the payout account (and let withdrawals finish) first.", "COUNTRY_LOCKED");
    }
  }

  const moved = input.businessAddress !== current.businessAddress || country !== current.country;
  const pin = moved ? await geocodeAddress(input.businessAddress, country) : null;
  await prisma.businesses.update({
    where: { id },
    data: { businessAddress: input.businessAddress, country, ...(pin ? { latitude: pin.latitude, longitude: pin.longitude } : {}), updatedAt: new Date() },
  });
  return { ...(await getBusinessProfile(userId)), mapPinUpdated: !moved || !!pin };
}

/** Adds one photo to the gallery (up to four). */
export async function addGalleryImage(userId: string, buffer: Buffer, mimeType: string) {
  const { id } = await requireMerchantBusiness(userId);
  const before = gallery((await prisma.businesses.findUniqueOrThrow({ where: { id }, select: { businessImage: true } })).businessImage);
  if (before.length >= MAX_GALLERY) throw AppError.badRequest(`You can have up to ${MAX_GALLERY} gallery photos. Remove one first.`, "GALLERY_FULL");
  const { url } = await uploadBusinessImage("galleryImages", id, buffer, mimeType);
  // Appended in SQL with the limit re-checked, so two uploads at once can't pass four.
  const added = await prisma.$executeRaw`
    UPDATE businesses
    SET "businessImage" = (CASE WHEN jsonb_typeof("businessImage"::jsonb) = 'array' THEN "businessImage"::jsonb ELSE '[]'::jsonb END) || ${JSON.stringify([url])}::jsonb,
        "updatedAt" = NOW()
    WHERE id = ${id}::uuid
      AND (CASE WHEN jsonb_typeof("businessImage"::jsonb) = 'array' THEN jsonb_array_length("businessImage"::jsonb) ELSE 0 END) < ${MAX_GALLERY}`;
  if (!added) {
    await deleteBusinessImages("galleryImages", id, [url]);
    throw AppError.badRequest(`You can have up to ${MAX_GALLERY} gallery photos. Remove one first.`, "GALLERY_FULL");
  }
  return getBusinessProfile(userId);
}

/** Removes a gallery photo (and its file, when it was uploaded here). */
export async function removeGalleryImage(userId: string, url: string) {
  const { id } = await requireMerchantBusiness(userId);
  const images = gallery((await prisma.businesses.findUniqueOrThrow({ where: { id }, select: { businessImage: true } })).businessImage);
  if (!images.includes(url)) throw AppError.notFound("Photo");
  await prisma.businesses.update({ where: { id }, data: { businessImage: images.filter((u) => u !== url), updatedAt: new Date() } });
  if (businessImageUrlPrefix("galleryImages", id) && url.startsWith(businessImageUrlPrefix("galleryImages", id)!)) await deleteBusinessImages("galleryImages", id, [url]);
  return getBusinessProfile(userId);
}
