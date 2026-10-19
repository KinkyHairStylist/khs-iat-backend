import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// A customer's favourite services (the hearts on the salon listing).

/** Every service the customer has favourited — so every heart on a page shows correctly. */
export async function listFavoriteServiceIds(userId: string): Promise<string[]> {
  const rows = await prisma.favoriteService.findMany({ where: { userId }, select: { serviceId: true } });
  return rows.map((r) => r.serviceId);
}

/** Adds a favourite. Already a favourite is fine (a double click, two tabs). */
export async function addFavorite(userId: string, serviceId: string): Promise<void> {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
  if (!service) throw AppError.notFound("Service");

  await prisma.favoriteService.upsert({
    where: { userId_serviceId: { userId, serviceId } },
    create: { userId, serviceId },
    update: {},
  });
}

/** Removes a favourite. Not a favourite (already removed) is fine. */
export async function removeFavorite(userId: string, serviceId: string): Promise<void> {
  await prisma.favoriteService.deleteMany({ where: { userId, serviceId } });
}

/**
 * The favourites page: each favourite service, newest first, with its salon.
 * A salon that isn't approved any more is left out (its page can't be opened).
 */
export async function listFavorites(userId: string) {
  const rows = await prisma.favoriteService.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      Service: {
        select: {
          id: true, name: true, price: true, priceType: true, minPrice: true, maxPrice: true, duration: true, images: true,
          businesses: { select: { id: true, businessName: true, businessAddress: true, businessImage: true, performance: true, status: true } },
        },
      },
    },
  });
  return rows.map(({ Service: s, ...fav }) => {
    const b = s.businesses;
    const rating = Number((b?.performance as { rating?: number } | null)?.rating ?? NaN);
    return {
      ...fav,
      service: {
        id: s.id, name: s.name, duration: s.duration, images: s.images, priceType: s.priceType,
        price: s.price?.toString() ?? null, minPrice: s.minPrice?.toString() ?? null, maxPrice: s.maxPrice?.toString() ?? null,
        business: b && b.status === "approved"
          ? { id: b.id, businessName: b.businessName, businessAddress: b.businessAddress, businessImage: b.businessImage, rating: Number.isFinite(rating) ? rating : null }
          : null,
      },
    };
  });
}
