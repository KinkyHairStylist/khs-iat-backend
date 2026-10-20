import prisma, { WRITE_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { businessImageUrlPrefix, deleteBusinessImages, uploadBusinessImage } from "../../../lib/firebase/storage";
import { AppError } from "../../../middlewares/centralAppError";
import type { ClientInput } from "../../../schemas/merchant/clients.schema";
import { requireMerchantBusiness } from "../merchantBusiness";
import { addressRows, contactRows, profileData, settingsData } from "./clientMapping";
import { getClient, ownClient } from "./clientQueries";

// Adding, changing and removing the salon's client records. One request saves
// the whole profile in one transaction (the old form made four, and a failure
// part-way left a half-made client). A client record never creates or changes
// a KHS account (the old code made one with a password emailed in plain text).

type Tx = Prisma.TransactionClient;

function assertPhoto(businessId: string, url: string | null | undefined, existing: string | null) {
  if (!url || url === existing) return;
  const prefix = businessImageUrlPrefix("clientImages", businessId);
  if (!prefix || !url.startsWith(prefix)) throw AppError.badRequest("Please upload the photo again.", "INVALID_IMAGE");
}

async function setDetails(tx: Tx, clientId: string, input: ClientInput) {
  await Promise.all([tx.client_addresses.deleteMany({ where: { client_id: clientId } }), tx.emergency_contacts_schema.deleteMany({ where: { client_id: clientId } })]);
  if (input.addresses.length) await tx.client_addresses.createMany({ data: addressRows(clientId, input) });
  if (input.emergencyContacts.length) await tx.emergency_contacts_schema.createMany({ data: contactRows(clientId, input) });
  const settings = settingsData(input);
  const existing = await tx.client_settings.findFirst({ where: { client_id: clientId }, select: { id: true } });
  if (existing) await tx.client_settings.update({ where: { id: existing.id }, data: { ...settings, updatedAt: new Date() } });
  else await tx.client_settings.create({ data: { ...settings, client_id: clientId } });
}

export async function createClient(userId: string, input: ClientInput) {
  const business = await requireMerchantBusiness(userId);
  assertPhoto(business.id, input.profileImage, null);
  // An email is one client per owner. One removed before is brought back.
  const existing = await prisma.clients.findFirst({ where: { owner_id: business.ownerId, email: { equals: input.email, mode: "insensitive" } }, select: { id: true, isActive: true } });
  if (existing?.isActive) throw AppError.conflict("You already have a client with this email.", "CLIENT_EXISTS");

  const id = await prisma.$transaction(async (tx) => {
    const client = existing
      ? await tx.clients.update({ where: { id: existing.id }, data: { ...profileData(input), isActive: true, createdAt: new Date(), updatedAt: new Date() }, select: { id: true } })
      : await tx.clients.create({ data: { ...profileData(input), owner_id: business.ownerId }, select: { id: true } });
    await setDetails(tx, client.id, input);
    return client.id;
  }, WRITE_TX_OPTIONS);
  return getClient(userId, id);
}

export async function updateClient(userId: string, clientId: string, input: ClientInput) {
  const business = await requireMerchantBusiness(userId);
  const client = await ownClient(business.ownerId, clientId);
  assertPhoto(business.id, input.profileImage, client.profileImage);
  if (input.email !== client.email.toLowerCase()) {
    const taken = await prisma.clients.findFirst({ where: { owner_id: business.ownerId, email: { equals: input.email, mode: "insensitive" }, NOT: { id: clientId } }, select: { id: true } });
    if (taken) throw AppError.conflict("Another client already uses this email.", "CLIENT_EXISTS");
  }
  await prisma.$transaction(async (tx) => {
    await tx.clients.update({ where: { id: clientId }, data: { ...profileData(input), updatedAt: new Date() } });
    await setDetails(tx, clientId, input);
  }, WRITE_TX_OPTIONS);
  if (client.profileImage && client.profileImage !== input.profileImage) void deleteBusinessImages("clientImages", business.id, [client.profileImage]);
  return getClient(userId, clientId);
}

/** Removes a client from the list (kept for the booking history). */
export async function deleteClient(userId: string, clientId: string) {
  const business = await requireMerchantBusiness(userId);
  await ownClient(business.ownerId, clientId);
  await prisma.clients.update({ where: { id: clientId }, data: { isActive: false, updatedAt: new Date() } });
}

export async function addClientImage(userId: string, buffer: Buffer, mimeType: string) {
  const business = await requireMerchantBusiness(userId);
  const { url } = await uploadBusinessImage("clientImages", business.id, buffer, mimeType);
  return { url };
}
