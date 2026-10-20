import { IntegrationAuthError } from "../../../lib/integrations/errors";
import { upsertMember } from "../../../lib/integrations/mailchimp";
import { getServiceLogger } from "../../../utils/loggerCreator";
import { notifyUser } from "../../notificationsService";
import { invoiceOrder, voidCancelled } from "./booksSync";
import { forgetCalendarZone, placeOnCalendar, removeFromCalendar } from "./calendarSync";
import { forgetGoogle, forgetMailchimp, forgetZoho, mailchimpAccess } from "./credentials";
import { loadSyncOrder, type SyncOrder } from "./syncOrder";

const logger = getServiceLogger("integration-sync");

// Keeps a salon's connected apps in step with its bookings, whichever way a
// booking was confirmed, moved or cancelled. Called fire-and-forget after the
// change is saved: a failing app is logged and never affects the booking. When
// an app's saved access stops working it's forgotten and the salon is told to
// reconnect (Settings shows Connect again).

type App = { name: string; forget: (businessId: string) => Promise<unknown> };
const GOOGLE: App = { name: "Google Calendar", forget: async (id) => (forgetCalendarZone(id), forgetGoogle(id)) };
const MAILCHIMP: App = { name: "Mailchimp", forget: forgetMailchimp };
const ZOHO: App = { name: "ZohoBooks", forget: forgetZoho };

async function guarded(app: App, order: SyncOrder, orderId: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      logger.warn(`${app.name} access stopped working; disconnecting`, { businessId: order.businessId });
      await app.forget(order.businessId).catch(() => undefined);
      notifyUser(order.ownerId, {
        title: `${app.name} was disconnected`,
        message: `${app.name} stopped accepting KHS's access, so your bookings aren't syncing to it any more. Reconnect it in Settings → Integrations.`,
        link: "/merchant/dashboard/settings?tab=integrations",
      });
      return;
    }
    logger.error(`${app.name} sync failed`, { businessId: order.businessId, orderId, error: (err as Error).message });
  }
}

async function addClientToAudience(order: SyncOrder): Promise<void> {
  const c = order.client;
  if (!c?.email) return;
  const access = await mailchimpAccess(order.businessId);
  if (!access) return;
  await upsertMember(access.apiKey, access.dataCentre, access.audienceId, { email: c.email, firstName: c.firstName.split(" ")[0] ?? "", lastName: c.lastName });
}

/** One sync, awaited (the exports below run it in the background). */
export async function runIntegrationSync(orderId: string, kind: "confirmed" | "cancelled" | "rescheduled"): Promise<void> {
  const order = await loadSyncOrder(orderId);
  if (!order) return;
  if (kind === "confirmed") {
    await Promise.all([
      guarded(GOOGLE, order, orderId, () => placeOnCalendar(order)),
      guarded(MAILCHIMP, order, orderId, () => addClientToAudience(order)),
      guarded(ZOHO, order, orderId, () => invoiceOrder(order)),
    ]);
  } else if (kind === "cancelled") {
    await Promise.all([guarded(GOOGLE, order, orderId, () => removeFromCalendar(order)), guarded(ZOHO, order, orderId, () => voidCancelled(order))]);
  } else {
    await guarded(GOOGLE, order, orderId, () => placeOnCalendar(order));
  }
}

const background = (orderId: string | null | undefined, kind: "confirmed" | "cancelled" | "rescheduled") => {
  if (!orderId) return;
  void runIntegrationSync(orderId, kind).catch((err: Error) => logger.error("Integration sync failed", { orderId, kind, error: err.message }));
};

/** A booking was confirmed (paid, accepted by the salon, or made by the salon). */
export const syncBookingConfirmed = (orderId: string | null | undefined) => background(orderId, "confirmed");
/** Appointments of the order were cancelled. */
export const syncBookingCancelled = (orderId: string | null | undefined) => background(orderId, "cancelled");
/** The order moved to a new date or time. */
export const syncBookingRescheduled = (orderId: string | null | undefined) => background(orderId, "rescheduled");
