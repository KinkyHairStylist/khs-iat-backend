import prisma from "../../../lib/prisma/prisma";

// The booking facts the integrations need, for one order.

export interface SyncPerson { email: string | null; firstName: string; lastName: string; phone: string }

export interface SyncAppointment {
  id: string;
  orderId: string | null;
  serviceName: string;
  date: string;
  time: string;
  duration: string;
  amount: number;
  status: string;
  paid: boolean;
  specialRequests: string | null;
  googleEventId: string | null;
  zohoInvoiceId: string | null;
  zohoCustomerId: string | null;
  staff: SyncPerson[];
}

export interface SyncOrder {
  businessId: string;
  ownerId: string;
  client: SyncPerson | null;
  /** Paid by card (deposit or in full); null when paid another way or not yet. */
  card: { isDeposit: boolean } | null;
  rows: SyncAppointment[];
}

const person = (p: { email?: string | null; firstName?: string | null; surname?: string | null; lastName?: string | null; phone?: string | null; phoneNumber?: string | null }): SyncPerson => ({
  email: p.email?.trim() || null,
  firstName: (p.firstName ?? "").trim(),
  lastName: (p.surname ?? p.lastName ?? "").trim(),
  phone: (p.phoneNumber ?? p.phone ?? "").trim(),
});

export async function loadSyncOrder(orderId: string): Promise<SyncOrder | null> {
  const rows = await prisma.appointments.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { email: true, firstName: true, surname: true, phoneNumber: true } },
      appointment_staff: { select: { staff: { select: { email: true, firstName: true, lastName: true } } } },
      businesses: { select: { id: true, owner_id: true } },
    },
  });
  const first = rows[0];
  if (!first?.businesses) return null;

  const salonClient = !first.user && first.business_client_id
    ? await prisma.clients.findUnique({ where: { id: first.business_client_id }, select: { email: true, firstName: true, lastName: true, phone: true } })
    : null;
  const card = await prisma.stripe_payment_intents.findFirst({ where: { orderId, status: { in: ["held", "released"] } }, select: { isDeposit: true } });

  return {
    businessId: first.businesses.id,
    ownerId: first.businesses.owner_id,
    client: first.user ? person(first.user) : salonClient ? person(salonClient) : null,
    card,
    rows: rows.map((r) => ({
      id: r.id, orderId: r.orderId, serviceName: r.serviceName, date: r.date, time: r.time, duration: r.duration, amount: r.amount,
      status: r.status, paid: r.paymentStatus === "Paid", specialRequests: r.specialRequests,
      googleEventId: r.googleEventId, zohoInvoiceId: r.zohoInvoiceId, zohoCustomerId: r.zohoCustomerId,
      staff: r.appointment_staff.map((s) => person(s.staff)),
    })),
  };
}

export const isOnCalendar = (r: SyncAppointment) => r.status === "Confirmed" || r.status === "Rescheduled";
