import prisma from "../../lib/prisma/prisma";
import { deleteAvatarFiles, uploadAvatar } from "../../lib/firebase/storage";
import { AppError } from "../../middlewares/centralAppError";
import type { z } from "zod";
import type { updateProfileSchema } from "../../schemas/customer/profile.schema";

// The profile page: name, phone, gender, date of birth and photo. The email is
// the account's identity and isn't changed here.

const PROFILE_SELECT = {
  id: true, email: true, firstName: true, surname: true, phoneNumber: true, gender: true, dateOfBirth: true, avatarUrl: true,
} as const;

type ProfileRow = { dateOfBirth: Date | null } & Record<string, unknown>;

// A date column comes back as midnight UTC; the form wants YYYY-MM-DD.
const toView = <T extends ProfileRow>(row: T) => ({ ...row, dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null });

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!user) throw AppError.notFound("Account");
  return toView(user);
}

export async function updateProfile(userId: string, input: z.infer<typeof updateProfileSchema>) {
  const { dateOfBirth, ...rest } = input;
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null } : {}),
      updatedAt: new Date(),
    },
    select: PROFILE_SELECT,
  });
  return toView(user);
}

/** Bytes already checked to be JPEG, PNG or WebP (middlewares/imageUpload). */
export async function setAvatar(userId: string, buffer: Buffer, mimeType: string) {
  const { url } = await uploadAvatar(userId, buffer, mimeType);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url, updatedAt: new Date() }, select: PROFILE_SELECT });
  return toView(user);
}

export async function removeAvatar(userId: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null, updatedAt: new Date() }, select: PROFILE_SELECT });
  await deleteAvatarFiles(userId);
  return toView(user);
}
