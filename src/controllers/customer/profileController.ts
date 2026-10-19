import { idParamSchema } from "../../schemas/fields";
import { addressSchema, updateProfileSchema } from "../../schemas/customer/profile.schema";
import { parseSchema } from "../../utils/parseSchema";
import { AppError } from "../../middlewares/centralAppError";
import { customerHandler } from "../customerHandler";
import { getProfile, removeAvatar, setAvatar, updateProfile } from "../../services/customer/profileService";
import { addAddress, deleteAddress, listAddresses, updateAddress } from "../../services/customer/addressesService";

// The profile page: personal details, photo and saved addresses.

export const profile = customerHandler(async (_req, res, userId) => {
  res.success(await getProfile(userId));
});

export const editProfile = customerHandler(async (req, res, userId) => {
  res.success(await updateProfile(userId, parseSchema(updateProfileSchema, req.body)), "Profile updated.");
});

// imageUpload has already checked the file is a real JPEG, PNG or WebP.
export const uploadPhoto = customerHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await setAvatar(userId, req.file.buffer, req.file.mimetype), "Profile photo updated.");
});

export const deletePhoto = customerHandler(async (_req, res, userId) => {
  res.success(await removeAvatar(userId), "Profile photo removed.");
});

export const addresses = customerHandler(async (_req, res, userId) => {
  res.success(await listAddresses(userId));
});

export const createAddress = customerHandler(async (req, res, userId) => {
  res.success(await addAddress(userId, parseSchema(addressSchema, req.body)), "Address added.", 201);
});

export const editAddress = customerHandler(async (req, res, userId) => {
  res.success(await updateAddress(userId, parseSchema(idParamSchema, req.params).id, parseSchema(addressSchema, req.body)), "Address updated.");
});

export const removeAddress = customerHandler(async (req, res, userId) => {
  await deleteAddress(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Address deleted.");
});
