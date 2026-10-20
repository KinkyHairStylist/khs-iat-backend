import { idParamSchema } from "../../schemas/fields";
import { addressSchema, updateProfileSchema } from "../../schemas/customer/profile.schema";
import {
  bookingRulesSchema, businessHoursSchema, businessInfoSchema, businessLocationSchema, cancellationWindowSchema, depositSettingSchema, galleryImageSchema,
  notificationSettingsSchema,
} from "../../schemas/merchant/settings.schema";
import { AppError } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { addAddress, deleteAddress, listAddresses, updateAddress } from "../../services/customer/addressesService";
import { getProfile, removeAvatar, setAvatar, updateProfile } from "../../services/customer/profileService";
import {
  addGalleryImage, getBusinessProfile, removeGalleryImage, updateBusinessHours, updateBusinessInfo, updateBusinessLocation,
} from "../../services/merchant/settings/businessProfile";
import { getSettings, saveBookingRules, saveCancellationWindow, saveDepositSetting, saveNotifications } from "../../services/merchant/settings/ownerSettings";
import { merchantHandler } from "./merchantHandler";

// Settings: the salon's rules and profile, and the owner's own account (the
// same profile and address book a customer has, under the merchant session).

export const settings = merchantHandler(async (_req, res, userId) => res.success(await getSettings(userId)));
export const notifications = merchantHandler(async (req, res, userId) =>
  res.success(await saveNotifications(userId, parseSchema(notificationSettingsSchema, req.body)), "Notification settings saved"));
export const bookingRules = merchantHandler(async (req, res, userId) =>
  res.success(await saveBookingRules(userId, parseSchema(bookingRulesSchema, req.body)), "Booking rules saved"));
export const cancellation = merchantHandler(async (req, res, userId) =>
  res.success(await saveCancellationWindow(userId, parseSchema(cancellationWindowSchema, req.body).cancellationWindow), "Cancellation window saved"));
export const deposit = merchantHandler(async (req, res, userId) =>
  res.success(await saveDepositSetting(userId, parseSchema(depositSettingSchema, req.body).allowDepositPayment), "Deposit setting saved"));

export const business = merchantHandler(async (_req, res, userId) => res.success(await getBusinessProfile(userId)));
export const businessInfo = merchantHandler(async (req, res, userId) =>
  res.success(await updateBusinessInfo(userId, parseSchema(businessInfoSchema, req.body)), "Business details saved"));
export const businessHours = merchantHandler(async (req, res, userId) =>
  res.success(await updateBusinessHours(userId, parseSchema(businessHoursSchema, req.body).bookingDays), "Opening hours saved"));
export const businessLocation = merchantHandler(async (req, res, userId) =>
  res.success(await updateBusinessLocation(userId, parseSchema(businessLocationSchema, req.body)), "Location saved"));
export const addGallery = merchantHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await addGalleryImage(userId, req.file.buffer, req.file.mimetype), "Photo added", 201);
});
export const removeGallery = merchantHandler(async (req, res, userId) =>
  res.success(await removeGalleryImage(userId, parseSchema(galleryImageSchema, req.body).url), "Photo removed"));

export const profile = merchantHandler(async (_req, res, userId) => res.success(await getProfile(userId)));
export const editProfile = merchantHandler(async (req, res, userId) => res.success(await updateProfile(userId, parseSchema(updateProfileSchema, req.body)), "Profile updated"));
export const uploadPhoto = merchantHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await setAvatar(userId, req.file.buffer, req.file.mimetype), "Profile photo updated");
});
export const deletePhoto = merchantHandler(async (_req, res, userId) => res.success(await removeAvatar(userId), "Profile photo removed"));
export const addresses = merchantHandler(async (_req, res, userId) => res.success(await listAddresses(userId)));
export const createAddress = merchantHandler(async (req, res, userId) => res.success(await addAddress(userId, parseSchema(addressSchema, req.body)), "Address added", 201));
export const editAddress = merchantHandler(async (req, res, userId) =>
  res.success(await updateAddress(userId, parseSchema(idParamSchema, req.params).id, parseSchema(addressSchema, req.body)), "Address updated"));
export const removeAddress = merchantHandler(async (req, res, userId) => {
  await deleteAddress(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Address deleted");
});
