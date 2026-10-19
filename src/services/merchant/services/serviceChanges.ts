import prisma, { WRITE_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import type { Service_category_enum, Service_servicetype_enum } from "../../../generated/prisma/enums";
import { deleteServiceImages, serviceImageUrlPrefix, uploadServiceImage } from "../../../lib/firebase/storage";
import { AppError } from "../../../middlewares/centralAppError";
import type { ServiceInput } from "../../../schemas/merchant/services.schema";
import { requireMerchantBusiness } from "../merchantBusiness";
import { SERVICE_SELECT, serviceView, toDbEnum } from "./serviceQueries";

// Adding, changing and removing the salon's services. Everything that points
// elsewhere is checked: team members must be on this salon's active team
// (the old endpoints took any staff id, and saved only the first one ticked),
// photos must be this salon's own uploads, and a plan must exist.

type Tx = Prisma.TransactionClient;

async function assertTeam(businessId: string, staffIds: string[]) {
  if (staffIds.length === 0) return;
  const found = await prisma.staff.count({ where: { id: { in: staffIds }, business_id: businessId, isActive: true } });
  if (found !== staffIds.length) throw AppError.badRequest("One of those people isn't on your active team.", "NOT_ON_TEAM");
}

/** Photos uploaded for this salon, or ones the service already had (older services were stored elsewhere). */
function assertImages(businessId: string, images: string[], existing: string[]) {
  const prefix = serviceImageUrlPrefix(businessId);
  const bad = images.find((url) => !existing.includes(url) && !(prefix && url.startsWith(prefix)));
  if (bad) throw AppError.badRequest("Please upload the photos again.", "INVALID_IMAGE");
}

async function assertPlan(planId: string | null | undefined) {
  if (planId && !(await prisma.advertising_plans.findUnique({ where: { id: planId }, select: { id: true } }))) {
    throw AppError.badRequest("That advertising plan isn't available.", "PLAN_NOT_FOUND");
  }
}

function serviceData(input: ServiceInput) {
  const fixed = input.priceType === "fixed";
  return {
    name: input.name,
    description: input.description,
    category: toDbEnum<Service_category_enum>(input.category),
    serviceType: input.serviceType ? toDbEnum<Service_servicetype_enum>(input.serviceType) : null,
    priceType: input.priceType,
    // Switching price type clears the other kind, so a stale price is never shown.
    price: fixed ? input.price! : null,
    minPrice: fixed ? null : input.minPrice!,
    maxPrice: fixed ? null : input.maxPrice!,
    duration: String(input.durationMinutes),
    images: input.images,
    advertisementPlanId: input.advertisementPlanId ?? null,
    updatedAt: new Date(),
  };
}

async function setTeam(tx: Tx, serviceId: string, staffIds: string[]) {
  await tx.service_staff.deleteMany({ where: { serviceId } });
  if (staffIds.length) await tx.service_staff.createMany({ data: staffIds.map((staffId) => ({ serviceId, staffId })) });
}

/** Adds the category to the salon's list if it isn't there yet. */
async function ensureCategory(tx: Tx, businessId: string, category: string) {
  await tx.$executeRaw`
    UPDATE businesses SET category = COALESCE(category, '[]'::jsonb) || to_jsonb(${category}::text)
    WHERE id = ${businessId}::uuid AND NOT (COALESCE(category, '[]'::jsonb) ? ${category})`;
}

export async function createService(userId: string, input: ServiceInput) {
  const business = await requireMerchantBusiness(userId);
  assertImages(business.id, input.images, []);
  await Promise.all([assertTeam(business.id, input.staffIds), assertPlan(input.advertisementPlanId)]);
  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.service.create({ data: { ...serviceData(input), businessId: business.id }, select: { id: true } });
    await setTeam(tx, created.id, input.staffIds);
    await ensureCategory(tx, business.id, input.category);
    return created.id;
  }, WRITE_TX_OPTIONS);
  return serviceView(await prisma.service.findUniqueOrThrow({ where: { id }, select: SERVICE_SELECT }));
}

async function ownService(businessId: string, serviceId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId }, select: { id: true, images: true } });
  if (!service) throw AppError.notFound("Service");
  return service;
}

export async function updateService(userId: string, serviceId: string, input: ServiceInput) {
  const business = await requireMerchantBusiness(userId);
  const existing = await ownService(business.id, serviceId);
  assertImages(business.id, input.images, existing.images);
  await Promise.all([assertTeam(business.id, input.staffIds), assertPlan(input.advertisementPlanId)]);
  await prisma.$transaction(async (tx) => {
    await tx.service.update({ where: { id: serviceId }, data: serviceData(input) });
    await setTeam(tx, serviceId, input.staffIds);
    await ensureCategory(tx, business.id, input.category);
  }, WRITE_TX_OPTIONS);
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, select: SERVICE_SELECT });
  void deleteServiceImages(business.id, existing.images.filter((url) => !input.images.includes(url)));
  return serviceView(service);
}

/**
 * Removes a service nobody has booked. One with bookings stays (the booking
 * history needs it), and so does one sold as a membership — deleting it would
 * also delete those packages.
 */
export async function deleteService(userId: string, serviceId: string) {
  const business = await requireMerchantBusiness(userId);
  const existing = await ownService(business.id, serviceId);
  const [bookings, memberships] = await Promise.all([
    prisma.appointments.count({ where: { service_id: serviceId } }),
    prisma.merchant_membership_packages.count({ where: { serviceId } }),
  ]);
  if (bookings > 0) throw AppError.conflict("This service has bookings, so it can't be deleted.", "SERVICE_HAS_BOOKINGS");
  if (memberships > 0) throw AppError.conflict("This service is part of a membership package. Remove it from the package first.", "SERVICE_IN_MEMBERSHIP");
  await prisma.service.delete({ where: { id: serviceId } });
  void deleteServiceImages(business.id, existing.images);
}

/** Sets who can do a service (empty = anyone on the team). */
export async function assignServiceStaff(userId: string, serviceId: string, staffIds: string[]) {
  const business = await requireMerchantBusiness(userId);
  await ownService(business.id, serviceId);
  await assertTeam(business.id, staffIds);
  await prisma.$transaction((tx) => setTeam(tx, serviceId, staffIds), WRITE_TX_OPTIONS);
  return { staffIds };
}

/** A photo for a service, saved in this salon's folder; returns its URL for the service form. */
export async function addServiceImage(userId: string, buffer: Buffer, mimeType: string) {
  const business = await requireMerchantBusiness(userId);
  const { url } = await uploadServiceImage(business.id, buffer, mimeType);
  return { url };
}
