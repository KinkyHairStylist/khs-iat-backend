import prisma, { WRITE_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { DELIVERY_TEAM_EMAIL } from "../../../config/env";
import { staffAddedEmail, staffRemovedEmail } from "../../../emails";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import { businessImageUrlPrefix, deleteBusinessImages, uploadBusinessImage } from "../../../lib/firebase/storage";
import { AppError } from "../../../middlewares/centralAppError";
import type { StaffInput } from "../../../schemas/merchant/staff.schema";
import { requireMerchantBusiness, type MerchantBusiness } from "../merchantBusiness";
import { STAFF_SELECT, staffView } from "./staffQueries";

// Adding, changing and removing team members. A team member is a record of
// the salon's — adding someone never touches a KHS account (the old code
// overwrote an existing customer's name and photo and turned their account
// into a merchant one, and emailed new people a password in plain text).

type Tx = Prisma.TransactionClient;

async function assertServices(businessId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return;
  const found = await prisma.service.count({ where: { id: { in: serviceIds }, businessId } });
  if (found !== serviceIds.length) throw AppError.badRequest("One of those services isn't yours.", "NOT_YOUR_SERVICE");
}

function assertAvatar(businessId: string, avatar: string | null | undefined, existing: string | null) {
  if (!avatar || avatar === existing) return;
  const prefix = businessImageUrlPrefix("staffImages", businessId);
  if (!prefix || !avatar.startsWith(prefix)) throw AppError.badRequest("Please upload the photo again.", "INVALID_IMAGE");
}

function profileData(input: StaffInput) {
  return {
    firstName: input.firstName, lastName: input.lastName, email: input.email, gender: input.gender, dob: input.dob ?? null,
    phoneNumber: input.phoneNumber, jobTitle: input.jobTitle, employmentType: input.employmentType ?? null, avatar: input.avatar ?? null,
    settings: input.settings, commissionRate: input.commissionRate ?? null,
  };
}

/** Replaces a member's addresses, contacts and services (the staff table keeps a copy of the service ids too). */
async function setDetails(tx: Tx, staffId: string, input: StaffInput) {
  await Promise.all([
    tx.addresses.deleteMany({ where: { staff_id: staffId } }),
    tx.emergency_contacts.deleteMany({ where: { staff_id: staffId } }),
    tx.service_staff.deleteMany({ where: { staffId } }),
  ]);
  if (input.addresses.length) await tx.addresses.createMany({ data: input.addresses.map((a) => ({ ...a, staff_id: staffId })) });
  if (input.emergencyContacts.length) await tx.emergency_contacts.createMany({ data: input.emergencyContacts.map((c) => ({ ...c, staff_id: staffId })) });
  if (input.servicesAssigned.length) await tx.service_staff.createMany({ data: input.servicesAssigned.map((serviceId) => ({ serviceId, staffId })) });
  await tx.staff.update({ where: { id: staffId }, data: { servicesAssigned: input.servicesAssigned.join(",") } });
}

const notify = (to: string, email: ReturnType<typeof staffAddedEmail>) => sendEmailInBackground({ to, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });

async function ownerEmail(business: MerchantBusiness) {
  return (await prisma.user.findUnique({ where: { id: business.ownerId }, select: { email: true } }))?.email?.toLowerCase();
}

export async function addStaff(userId: string, input: StaffInput) {
  const business = await requireMerchantBusiness(userId);
  if (input.email === (await ownerEmail(business))) throw AppError.badRequest("You can't add yourself to your own team.", "SELF");
  assertAvatar(business.id, input.avatar, null);
  await assertServices(business.id, input.servicesAssigned);

  // A staff email is unique across KHS. Someone this salon removed before is brought back.
  const existing = await prisma.staff.findUnique({ where: { email: input.email }, select: { id: true, business_id: true, isActive: true } });
  if (existing && existing.business_id !== business.id) throw AppError.conflict("This email already belongs to a team member at another salon.", "EMAIL_IN_USE");
  if (existing?.isActive) throw AppError.conflict("This person is already on your team.", "ALREADY_ON_TEAM");

  const id = await prisma.$transaction(async (tx) => {
    const staff = existing
      ? await tx.staff.update({ where: { id: existing.id }, data: { ...profileData(input), isActive: true }, select: { id: true } })
      : await tx.staff.create({ data: { ...profileData(input), business_id: business.id }, select: { id: true } });
    await setDetails(tx, staff.id, input);
    return staff.id;
  }, WRITE_TX_OPTIONS);

  notify(input.email, staffAddedEmail({ name: input.firstName, businessName: business.businessName }));
  return staffView(await prisma.staff.findUniqueOrThrow({ where: { id }, select: STAFF_SELECT }));
}

async function ownMember(businessId: string, staffId: string) {
  const member = await prisma.staff.findFirst({ where: { id: staffId, business_id: businessId, isActive: true }, select: { id: true, email: true, avatar: true, firstName: true } });
  if (!member) throw AppError.notFound("Team member");
  return member;
}

export async function editStaff(userId: string, staffId: string, input: StaffInput) {
  const business = await requireMerchantBusiness(userId);
  const member = await ownMember(business.id, staffId);
  assertAvatar(business.id, input.avatar, member.avatar);
  await assertServices(business.id, input.servicesAssigned);
  if (input.email !== member.email?.toLowerCase()) {
    if (input.email === (await ownerEmail(business))) throw AppError.badRequest("That's your own email.", "SELF");
    const taken = await prisma.staff.findUnique({ where: { email: input.email }, select: { id: true } });
    if (taken && taken.id !== staffId) throw AppError.conflict("Another team member already uses this email.", "EMAIL_IN_USE");
  }

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: staffId }, data: profileData(input) });
    await setDetails(tx, staffId, input);
  }, WRITE_TX_OPTIONS);
  if (member.avatar && member.avatar !== input.avatar) void deleteBusinessImages("staffImages", business.id, [member.avatar]);
  return staffView(await prisma.staff.findUniqueOrThrow({ where: { id: staffId }, select: STAFF_SELECT }));
}

/**
 * Takes someone off the team (kept as an inactive record for the booking
 * history). Their upcoming bookings keep them until reassigned — the count is
 * returned so the salon knows to. Their KHS account, if any, isn't touched.
 */
export async function removeStaff(userId: string, staffId: string, today: string) {
  const business = await requireMerchantBusiness(userId);
  const member = await ownMember(business.id, staffId);
  await prisma.staff.update({ where: { id: staffId }, data: { isActive: false } });
  const upcomingBookings = await prisma.appointments.count({
    where: { business_id: business.id, date: { gte: today }, status: { in: ["Pending", "Confirmed", "Rescheduled"] }, appointment_staff: { some: { staff_id: staffId } } },
  });
  if (member.email) notify(member.email, staffRemovedEmail({ name: member.firstName ?? "there", businessName: business.businessName }));
  return { upcomingBookings };
}

/** Sets which of the salon's services this person does, leaving everyone else on those services as they are. */
export async function setStaffServices(userId: string, staffId: string, serviceIds: string[]) {
  const business = await requireMerchantBusiness(userId);
  await ownMember(business.id, staffId);
  await assertServices(business.id, serviceIds);
  await prisma.$transaction(async (tx) => {
    await tx.service_staff.deleteMany({ where: { staffId } });
    if (serviceIds.length) await tx.service_staff.createMany({ data: serviceIds.map((serviceId) => ({ serviceId, staffId })) });
    await tx.staff.update({ where: { id: staffId }, data: { servicesAssigned: serviceIds.join(",") } });
  }, WRITE_TX_OPTIONS);
  return { serviceIds };
}

export async function addStaffImage(userId: string, buffer: Buffer, mimeType: string) {
  const business = await requireMerchantBusiness(userId);
  const { url } = await uploadBusinessImage("staffImages", business.id, buffer, mimeType);
  return { url };
}
