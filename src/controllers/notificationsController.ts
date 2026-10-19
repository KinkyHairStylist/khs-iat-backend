import { z } from "zod";
import { parseSchema } from "../utils/parseSchema";
import { idParamSchema, pageQuerySchema } from "../schemas/fields";
import * as notifications from "../services/notificationsService";
import { customerHandler } from "./customerHandler";

const listQuerySchema = pageQuerySchema.extend({
  unreadOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

export const list = customerHandler(async (req, res, userId) => {
  res.success(await notifications.listMyNotifications(userId, parseSchema(listQuerySchema, req.query)));
});

export const unreadCount = customerHandler(async (_req, res, userId) => {
  res.success(await notifications.myUnreadCount(userId));
});

export const markRead = customerHandler(async (req, res, userId) => {
  await notifications.markMyNotificationRead(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Marked as read.");
});

export const markAllRead = customerHandler(async (_req, res, userId) => {
  res.success(await notifications.markAllMyNotificationsRead(userId), "All notifications marked as read.");
});

export const remove = customerHandler(async (req, res, userId) => {
  await notifications.deleteMyNotification(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Notification deleted.");
});

export const removeAll = customerHandler(async (_req, res, userId) => {
  res.success(await notifications.deleteAllMyNotifications(userId), "All notifications deleted.");
});
