import { IntegrationCallError } from "../../../lib/integrations/errors";
import { books } from "../../../lib/integrations/zohoBooks";
import prisma from "../../../lib/prisma/prisma";
import redis from "../../../lib/redis/redis";
import { getServiceLogger } from "../../../utils/loggerCreator";
import { notifyUser } from "../../notificationsService";
import { zohoAccess } from "./credentials";
import { isOnCalendar, type SyncAppointment, type SyncOrder } from "./syncOrder";

const logger = getServiceLogger("zohobooks-sync");

// ZohoBooks follows the salon's bookings: one invoice per appointment (created
// once), with the payment recorded on it when the client paid — the deposit or
// the whole price, by card or another way (gift card, membership). A salon's own
// unpaid booking gets its invoice only. A cancelled booking's invoice is voided;
// Zoho refuses that once a payment is on it, and the salon is told to credit it.

type Books = ReturnType<typeof books>;

async function contactFor(api: Books, order: SyncOrder, a: SyncAppointment): Promise<string | null> {
  if (a.zohoCustomerId) return a.zohoCustomerId;
  const c = order.client;
  if (!c?.email) return null;
  const found = await api.get<{ contacts?: Array<{ contact_id: string }> }>("/contacts", { email: c.email });
  let id = found.contacts?.[0]?.contact_id;
  if (!id) {
    const created = await api.post<{ contact: { contact_id: string } }>("/contacts", {
      contact_name: `${c.firstName} ${c.lastName}`.trim() || c.email,
      contact_type: "customer",
      contact_persons: [{ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone }],
    });
    id = created.contact.contact_id;
  }
  // Every appointment of the order is for the same client.
  await prisma.appointments.updateMany({ where: a.orderId ? { orderId: a.orderId } : { id: a.id }, data: { zohoCustomerId: id } });
  for (const row of order.rows) row.zohoCustomerId = id;
  return id;
}

async function recordPayment(api: Books, order: SyncOrder, a: SyncAppointment, invoiceId: string, customerId: string): Promise<void> {
  const share = order.card?.isDeposit ? 0.5 : 1;
  const amount = Math.round(a.amount * share * 100) / 100;
  if (!(amount > 0)) return;
  // Books only takes a payment on a sent invoice; one already sent is fine.
  await api.post(`/invoices/${invoiceId}/status/sent`).catch(() => undefined);
  await api.post("/customerpayments", {
    customer_id: customerId,
    payment_mode: order.card ? "creditcard" : "others",
    amount,
    date: new Date().toISOString().slice(0, 10),
    invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
  });
}

/** An invoice for every booked appointment that doesn't have one yet. */
export async function invoiceOrder(order: SyncOrder): Promise<void> {
  const todo = order.rows.filter((a) => isOnCalendar(a) && !a.zohoInvoiceId);
  if (todo.length === 0) return;
  const access = await zohoAccess(order.businessId);
  if (!access) return;
  const api = books(access.dataCentre, access.accessToken, access.organizationId);

  for (const a of todo) {
    const lock = `integration:zoho:${a.id}`;
    if (!(await redis.set(lock, "1", "EX", 120, "NX"))) continue;
    try {
      const customerId = await contactFor(api, order, a);
      if (!customerId) {
        logger.info("Client has no email; no ZohoBooks invoice", { appointmentId: a.id });
        continue;
      }
      const created = await api.post<{ invoice: { invoice_id: string } }>("/invoices", {
        customer_id: customerId,
        date: a.date,
        due_date: a.date,
        reference_number: a.orderId ?? undefined,
        line_items: [{
          name: a.serviceName,
          description: `${a.serviceName} - ${a.date} at ${a.time}${a.staff.length ? `\nStaff: ${a.staff.map((s) => s.firstName).filter(Boolean).join(", ")}` : ""}`,
          rate: a.amount,
          quantity: 1,
          unit: "service",
        }],
        notes: a.specialRequests ?? "",
      });
      const invoiceId = created.invoice.invoice_id;
      await prisma.appointments.updateMany({ where: { id: a.id, zohoInvoiceId: null }, data: { zohoInvoiceId: invoiceId } });
      if (a.paid) {
        // The invoice exists either way; only the payment entry can be missing.
        await recordPayment(api, order, a, invoiceId, customerId).catch((err: Error) =>
          logger.error("ZohoBooks payment not recorded", { appointmentId: a.id, error: err.message }),
        );
      }
    } finally {
      await redis.del(lock);
    }
  }
}

/** Voids the invoices of cancelled appointments; one Zoho won't void is the salon's to credit. */
export async function voidCancelled(order: SyncOrder): Promise<void> {
  const cancelled = order.rows.filter((a) => a.status === "Cancelled" && a.zohoInvoiceId);
  if (cancelled.length === 0) return;
  const access = await zohoAccess(order.businessId);
  if (!access) return;
  const api = books(access.dataCentre, access.accessToken, access.organizationId);

  for (const a of cancelled) {
    const { invoice } = await api.get<{ invoice: { status: string } }>(`/invoices/${a.zohoInvoiceId}`);
    if (invoice.status === "void") continue;
    try {
      await api.post(`/invoices/${a.zohoInvoiceId}/status/void`);
    } catch (err) {
      if (!(err instanceof IntegrationCallError)) throw err;
      notifyUser(order.ownerId, {
        title: "A ZohoBooks invoice needs your attention",
        message: `Booking ${a.orderId ?? ""} (${a.serviceName}) was cancelled, but ZohoBooks didn't cancel its invoice, usually because a payment is already recorded on it. Open the invoice in ZohoBooks to refund or credit it, for example with a credit note.`,
        link: "/merchant/dashboard/settings?tab=integrations",
        metadata: { orderId: a.orderId, appointmentId: a.id, zohoInvoiceId: a.zohoInvoiceId },
      });
    }
  }
}
