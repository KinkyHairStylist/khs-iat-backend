// Pure helpers for the customer membership marketplace: what a package looks like in the list, and
// a safe search term. Nothing here touches the database.

export interface MarketplacePackageSource {
  id: string;
  businessId: string;
  serviceId: string;
  pricePerSession: number | string;
  sessionCount: number;
  expiryDays: number;
  business?: { businessName?: string | null; businessAddress?: string | null } | null;
  service?: { name?: string | null; category?: string | null; price?: number | string | null } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// One package as the marketplace shows it. Only what a customer needs: never the salon's owner
// details or anything else on the business record.
export function toMarketplaceItem(pkg: MarketplacePackageSource) {
  const pricePerSession = Number(pkg.pricePerSession);
  const total = round2(pricePerSession * pkg.sessionCount);
  const servicePrice =
    pkg.service?.price === null || pkg.service?.price === undefined ? null : Number(pkg.service.price);
  // What the same sessions would cost booked one by one, when the service has a fixed price.
  const regularTotal =
    servicePrice !== null && !Number.isNaN(servicePrice) ? round2(servicePrice * pkg.sessionCount) : null;

  return {
    id: pkg.id,
    businessId: pkg.businessId,
    businessName: pkg.business?.businessName ?? 'Salon',
    businessAddress: pkg.business?.businessAddress ?? null,
    serviceId: pkg.serviceId,
    serviceName: pkg.service?.name ?? 'Service',
    serviceCategory: pkg.service?.category ?? null,
    pricePerSession,
    sessionCount: pkg.sessionCount,
    expiryDays: pkg.expiryDays,
    total,
    // Only shown when the package is genuinely cheaper than booking the sessions separately.
    saving: regularTotal !== null && regularTotal > total ? round2(regularTotal - total) : 0,
  };
}

// Makes a customer's search text safe to use in a LIKE pattern, so "50%" or "a_b" match literally.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
