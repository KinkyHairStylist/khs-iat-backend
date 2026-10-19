import prisma from "../lib/prisma/prisma";
import { AppError } from "../middlewares/centralAppError";
import { getServiceLogger } from "../utils/loggerCreator";

const logger = getServiceLogger("notifications-service");

export type NotificationType = "BOOKING_CONFIRMED" | "BOOKING_CANCELLED" | "MESSAGE_RECEIVED" | "SYSTEM";

export interface NewNotification {
  type?: NotificationType;
  title: string;
  message: string;
  /** A page the notification opens (in the app of whoever receives it). */
  link?: string;
  /** Extra facts the receiving app can use, e.g. { orderId }. */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Adds a notification to the customer's bell. Fire-and-forget: never awaited
 * by callers and never throws, so a failed notification can't fail the action
 * it describes.
 */
export function notifyUser(userId: string, notification: NewNotification): void {
  prisma.notifications
    .create({
      data: {
        userId,
        type: notification.type ?? "SYSTEM",
        title: notification.title,
        message: notification.message,
        link: notification.link,
        metadata: notification.metadata,
      },
    })
    .catch((err: Error) => logger.error("Could not create notification", { userId, title: notification.title, error: err.message }));
}

// ─── The signed-in customer's own notifications (the bell) ────────────────────
// Every query is scoped to the caller's own userId, so nobody can read or
// change anyone else's.

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  link: true,
  isRead: true,
  readAt: true,
  metadata: true,
  createdAt: true,
} as const;

export async function listMyNotifications(userId: string, opts: { page: number; limit: number; unreadOnly: boolean }) {
  const where = { userId, ...(opts.unreadOnly ? { isRead: false } : {}) };
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notifications.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      select: NOTIFICATION_SELECT,
    }),
    prisma.notifications.count({ where }),
    prisma.notifications.count({ where: { userId, isRead: false } }),
  ]);
  return { notifications, total, page: opts.page, limit: opts.limit, unreadCount };
}

export async function myUnreadCount(userId: string) {
  return { unreadCount: await prisma.notifications.count({ where: { userId, isRead: false } }) };
}

export async function markMyNotificationRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notifications.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  // Already read is fine; someone else's (or a made-up id) is "not found".
  if (!count && !(await prisma.notifications.count({ where: { id, userId } }))) throw AppError.notFound("Notification");
}

export async function markAllMyNotificationsRead(userId: string) {
  const { count } = await prisma.notifications.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
  return { updated: count };
}

export async function deleteMyNotification(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notifications.deleteMany({ where: { id, userId } });
  if (!count) throw AppError.notFound("Notification");
}

export async function deleteAllMyNotifications(userId: string) {
  const { count } = await prisma.notifications.deleteMany({ where: { userId } });
  return { deleted: count };
}
