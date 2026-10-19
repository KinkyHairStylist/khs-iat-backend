import { RequestHandler, Router } from "express";
import * as notifications from "../controllers/notificationsController";
import { authenticate, authenticateMerchant } from "../middlewares/authenticate";

// The signed-in account's own notifications (the bell). The same routes serve
// customers (/notifications) and merchants (/merchant/notifications); each is
// behind its own session.
function notificationsRouter(auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);
  router.get("/", notifications.list);
  router.get("/unread-count", notifications.unreadCount);
  router.patch("/read-all", notifications.markAllRead);
  router.patch("/:id/read", notifications.markRead);
  router.delete("/", notifications.removeAll);
  router.delete("/:id", notifications.remove);
  return router;
}

export const customerNotificationsRouter = notificationsRouter(authenticate);
export const merchantNotificationsRouter = notificationsRouter(authenticateMerchant);
