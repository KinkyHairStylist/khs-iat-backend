import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { liveBookingSql } from "../../bookings/bookingHolds";
import { parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { monthOf } from "../../../utils/datePeriods";
import { requireMerchantBusiness } from "../merchantBusiness";
import { fullName } from "../bookings/salonOrder";

// Reading the salon's services page: its services (with who does them and
// this month's bookings and revenue, worked out here — the old page downloaded
// every booking to count them), its categories and its review status.

/** Prisma's enum names use "_" where the stored values use "-" ("hair_services" ↔ "hair-services"). */
export const fromDbEnum = (value: string | null) => (value ? value.replace(/_/g, "-") : null);
export const toDbEnum = <T extends string>(value: string) => value.replace(/-/g, "_") as T;

export const SERVICE_SELECT = {
  id: true, name: true, description: true, category: true, serviceType: true, priceType: true, price: true, minPrice: true, maxPrice: true,
  duration: true, images: true, createdAt: true, updatedAt: true, businessId: true,
  advertising_plans: { select: { id: true, planName: true, boost: true, durationDays: true, description: true } },
  service_staff: { select: { staff: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true, isActive: true } } } },
} satisfies Prisma.ServiceSelect;

type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof SERVICE_SELECT }>;
const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

export function serviceView(s: ServiceRow, stats?: { bookings: number; revenue: number }) {
  return {
    id: s.id,
    name: s.name ?? "",
    description: s.description ?? "",
    category: fromDbEnum(s.category),
    serviceType: fromDbEnum(s.serviceType),
    priceType: s.priceType ?? "fixed",
    price: num(s.price),
    minPrice: num(s.minPrice),
    maxPrice: num(s.maxPrice),
    duration: s.duration ?? "30",
    durationMinutes: parseDurationToMinutes(s.duration),
    images: s.images,
    advertisementPlan: s.advertising_plans,
    staff: s.service_staff.filter(({ staff }) => staff.isActive).map(({ staff }) => ({ id: staff.id, name: fullName(staff.firstName, staff.lastName) || staff.email || "", avatar: staff.avatar })),
    thisMonth: stats ?? { bookings: 0, revenue: 0 },
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** The business's categories (a JSON list of category values). */
export const categoriesOf = (value: Prisma.JsonValue | null): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

export async function listServices(userId: string, date: string) {
  const business = await requireMerchantBusiness(userId);
  const month = monthOf(date);
  const [services, details, stats] = await Promise.all([
    prisma.service.findMany({ where: { businessId: business.id }, select: SERVICE_SELECT, orderBy: { name: "asc" } }),
    prisma.businesses.findUnique({ where: { id: business.id }, select: { category: true } }),
    prisma.$queryRaw<Array<{ serviceId: string; bookings: number; revenue: number }>>`
      SELECT a.service_id::text AS "serviceId", COUNT(*)::int AS bookings,
             COALESCE(SUM(a.amount) FILTER (WHERE a.status IN ('Confirmed', 'Rescheduled', 'Completed')), 0)::float AS revenue
      FROM appointments a
      WHERE a.business_id = ${business.id}::uuid AND a.service_id IS NOT NULL AND a.date BETWEEN ${month.start} AND ${month.end} AND ${liveBookingSql()}
      GROUP BY a.service_id`,
  ]);
  const byService = new Map(stats.map((s) => [s.serviceId, { bookings: s.bookings, revenue: Math.round(s.revenue * 100) / 100 }]));
  return {
    businessStatus: business.status,
    categories: categoriesOf(details?.category ?? null),
    services: services.map((s) => serviceView(s, byService.get(s.id))),
  };
}

/** The advertising plans a service can be shown with (as set up by KHS). */
export async function listAdvertisingPlans() {
  const plans = await prisma.advertising_plans.findMany({ orderBy: { price: "asc" } });
  return plans.map((p) => ({
    id: p.id, planName: p.planName, price: p.price, durationDays: p.durationDays, description: p.description ?? "",
    features: p.features, isRecommended: p.isRecommended, boost: p.boost ?? "",
  }));
}
