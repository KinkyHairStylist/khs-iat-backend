import { idParamSchema } from "../../schemas/fields";
import { changePasswordSchema, updateNotificationSettingsSchema, updatePreferencesSchema } from "../../schemas/customer/settings.schema";
import { parseSchema } from "../../utils/parseSchema";
import { clearAuthCookies } from "../../utils/authCookies";
import { AppError } from "../../middlewares/centralAppError";
import { customerHandler } from "../customerHandler";
import { getNotificationSettings, updateNotificationSettings, updatePreferences } from "../../services/customer/settingsService";
import { deleteCard, listCards } from "../../services/customer/cardsService";
import { changePassword, closeAccount } from "../../services/customer/accountSecurityService";

// Settings: preferences, notification switches, saved cards, password and closing the account.

export const editPreferences = customerHandler(async (req, res, userId) => {
  res.success(await updatePreferences(userId, parseSchema(updatePreferencesSchema, req.body)), "Preferences updated.");
});

export const notificationSettings = customerHandler(async (_req, res, userId) => {
  res.success(await getNotificationSettings(userId));
});

export const editNotificationSettings = customerHandler(async (req, res, userId) => {
  res.success(await updateNotificationSettings(userId, parseSchema(updateNotificationSettingsSchema, req.body)), "Notification settings updated.");
});

export const cards = customerHandler(async (_req, res, userId) => {
  res.success(await listCards(userId));
});

export const removeCard = customerHandler(async (req, res, userId) => {
  await deleteCard(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Card removed.");
});

export const updatePassword = customerHandler(async (req, res, userId) => {
  if (!req.user) throw AppError.unauthorized();
  await changePassword(userId, req.user.sid, parseSchema(changePasswordSchema, req.body));
  res.success(null, "Your password has been changed. You've been signed out on your other devices.");
});

export const deleteAccount = customerHandler(async (_req, res, userId) => {
  await closeAccount(userId);
  clearAuthCookies(res);
  res.success(null, "Your account has been deleted.");
});
