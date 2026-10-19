import prisma from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { addressChangedEmail } from "../../emails";
import { AppError } from "../../middlewares/centralAppError";
import type { z } from "zod";
import type { addressSchema } from "../../schemas/customer/profile.schema";

// The customer's saved addresses (Home / Work). Adding or changing one emails
// the customer, so a change they didn't make doesn't go unnoticed.

type AddressInput = z.infer<typeof addressSchema>;

// Plenty for anyone; stops a script filling the table.
const MAX_ADDRESSES = 10;
const ADDRESS_SELECT = { id: true, type: true, fullAddress: true, createdAt: true } as const;

export function listAddresses(userId: string) {
  return prisma.user_address.findMany({ where: { userId }, select: ADDRESS_SELECT, orderBy: { createdAt: "asc" } });
}

async function announce(userId: string, address: AddressInput, action: "added" | "updated") {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
  if (!user) return;
  sendEmailInBackground({
    to: user.email,
    ...addressChangedEmail({ name: user.firstName || "Customer", addressType: address.type, fullAddress: address.fullAddress, action }),
    cc: DELIVERY_TEAM_EMAIL || undefined,
  });
}

export async function addAddress(userId: string, input: AddressInput) {
  if ((await prisma.user_address.count({ where: { userId } })) >= MAX_ADDRESSES) {
    throw AppError.badRequest(`You can save up to ${MAX_ADDRESSES} addresses. Please remove one first.`, "TOO_MANY_ADDRESSES");
  }
  const address = await prisma.user_address.create({ data: { ...input, userId }, select: ADDRESS_SELECT });
  void announce(userId, input, "added");
  return address;
}

/** Only the customer's own address; anyone else's is "not found". */
export async function updateAddress(userId: string, addressId: string, input: AddressInput) {
  const { count } = await prisma.user_address.updateMany({ where: { id: addressId, userId }, data: { ...input, updatedAt: new Date() } });
  if (!count) throw AppError.notFound("Address");
  void announce(userId, input, "updated");
  return prisma.user_address.findUniqueOrThrow({ where: { id: addressId }, select: ADDRESS_SELECT });
}

export async function deleteAddress(userId: string, addressId: string) {
  const { count } = await prisma.user_address.deleteMany({ where: { id: addressId, userId } });
  if (!count) throw AppError.notFound("Address");
}
