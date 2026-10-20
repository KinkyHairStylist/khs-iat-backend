import crypto from "crypto";
import prisma, { MONEY_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import type { CreateSalonBookingInput, SalonRescheduleInput } from "../../../schemas/merchant/bookings.schema";
import { parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { newOrderId } from "../../bookings/createBookingService";
import { claimSlot, lockSalonDay, prepareSlot } from "../../bookings/slotCheck";
import { requireMerchantBusiness } from "../merchantBusiness";
import { changeOf } from "./bookingActions";
import { syncBookingConfirmed } from "../integrations/integrationSync";
import { announceSalonChange } from "./salonBookingAnnouncements";
import { isStillBooked, loadSalonOrder, lockOrder, orderKey } from "./salonOrder";

// The salon booking one of its clients in, moving a booking, and choosing who
// does it. Every time is checked like a customer's (opening hours, clashes,
// blocked time, who's free) — the old endpoints took the business, price and
// length from the browser and checked nothing.

const CHANGED = "This booking changed a moment ago. Please refresh and try again.";

/** A booking for one of the salon's client records. Confirmed at once — the salon made it — and paid at the salon. */
export async function createSalonBooking(userId: string, input: CreateSalonBookingInput) {
  const business = await requireMerchantBusiness(userId);
  const [client, service] = await Promise.all([
    prisma.clients.findFirst({ where: { id: input.clientId, owner_id: business.ownerId, isActive: true }, select: { id: true } }),
    prisma.service.findFirst({
      where: { id: input.serviceId, businessId: business.id },
      select: {
        id: true, name: true, price: true, minPrice: true, maxPrice: true, duration: true,
        service_staff: { where: { staff: { isActive: true } }, select: { staffId: true } },
      },
    }),
  ]);
  if (!client) throw AppError.notFound("Client");
  if (!service) throw AppError.notFound("Service");

  const durationMinutes = parseDurationToMinutes(service.duration);
  const prepared = await prepareSlot(business.id);

  const created = await prisma.$transaction(async (tx) => {
    await lockSalonDay(tx, business.id, input.date);
    const stylist = await claimSlot(tx, {
      salonId: business.id, date: input.date, time: input.time, durationMinutes, timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      staffId: input.staffId, assignedPerService: [service.service_staff.map((s) => s.staffId)], asSalon: true,
    }, prepared);

    const id = crypto.randomUUID();
    const orderId = await newOrderId(tx);
    await tx.appointments.create({
      data: {
        id, orderId, business_id: business.id, business_client_id: client.id, service_id: service.id,
        serviceName: service.name ?? "Service", date: input.date, time: input.time, duration: service.duration ?? "30",
        amount: Number(service.price ?? service.minPrice ?? service.maxPrice ?? 0),
        status: "Confirmed", paymentStatus: "Unpaid", specialRequests: input.specialRequests || null,
      },
    });
    if (stylist) await tx.appointment_staff.create({ data: { appointment_id: id, staff_id: stylist.id } });
    return { id, orderId };
  }, MONEY_TX_OPTIONS);
  syncBookingConfirmed(created.orderId);
  return created;
}

/** Moves a booking (the whole order) to a new day and time. A paid booking stays paid. */
export async function rescheduleSalonBooking(userId: string, appointmentId: string, input: SalonRescheduleInput) {
  const business = await requireMerchantBusiness(userId);
  const order = await loadSalonOrder(business.id, appointmentId);
  const active = order.rows.filter(isStillBooked);
  if (active.length === 0) throw AppError.badRequest("Only a booking still on the calendar can be moved.", "NOT_MOVABLE");
  if (active.some((r) => r.status === "Pending" && r.client_id)) {
    throw AppError.badRequest("This client is still paying online, so the booking can't be moved yet.", "CUSTOMER_CHECKOUT");
  }

  const serviceIds = active.map((r) => r.service_id).filter((x): x is string => !!x);
  const assigned = serviceIds.length
    ? await prisma.service_staff.findMany({ where: { serviceId: { in: serviceIds }, staff: { isActive: true } }, select: { serviceId: true, staffId: true } })
    : [];
  const durationMinutes = active.reduce((sum, r) => sum + parseDurationToMinutes(r.duration), 0) || 30;
  const prepared = await prepareSlot(business.id);
  // The same stylist, if there was one and they're still on the team.
  const current = active[0].appointment_staff[0]?.staff.id ?? null;
  const keep = !!current && prepared.team.some((s) => s.id === current);
  const ids = active.map((r) => r.id);
  const entry = JSON.stringify([{ type: "rescheduled", at: new Date().toISOString(), by: "salon", from: `${order.opened.date} ${order.opened.time}`, ...(input.reason ? { note: input.reason } : {}) }]);

  await prisma.$transaction(async (tx) => {
    await lockSalonDay(tx, business.id, input.date);
    await lockOrder(tx, orderKey(order));
    const stylist = await claimSlot(tx, {
      salonId: business.id, date: input.date, time: input.time, durationMinutes, timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      staffId: keep ? current : null, assignedPerService: active.map((r) => assigned.filter((a) => a.serviceId === r.service_id).map((a) => a.staffId)),
      excludeOrderId: order.orderId ?? undefined, excludeAppointmentIds: ids, asSalon: true,
    }, prepared);

    // Confirmed bookings become Rescheduled; an older Pending salon booking stays Pending.
    const moved = await tx.$executeRaw`
      UPDATE appointments SET
        date = ${input.date}, time = ${input.time}, "updatedAt" = NOW(),
        status = CASE WHEN status = 'Pending' THEN status ELSE 'Rescheduled'::appointments_status_enum END,
        timeline = COALESCE(timeline, '[]'::jsonb) || ${entry}::jsonb
      WHERE id = ANY(${ids}::uuid[]) AND status IN ('Pending', 'Confirmed', 'Rescheduled')`;
    if (moved !== ids.length) throw AppError.conflict(CHANGED, "BOOKING_CHANGED");

    if (stylist?.id !== current) {
      await tx.appointment_staff.deleteMany({ where: { appointment_id: { in: ids } } });
      if (stylist) await tx.appointment_staff.createMany({ data: ids.map((id) => ({ appointment_id: id, staff_id: stylist.id })) });
    }
  }, MONEY_TX_OPTIONS);

  announceSalonChange({ ...changeOf(business, order), date: input.date, time: input.time }, { kind: "rescheduled" });
  return { date: input.date, time: input.time };
}

/** Sets who does a booking (the first is the main stylist). Only the salon's active team, only while it's still booked. */
export async function assignStaff(userId: string, appointmentId: string, staffIds: string[]) {
  const business = await requireMerchantBusiness(userId);
  const { opened } = await loadSalonOrder(business.id, appointmentId);
  if (!isStillBooked(opened)) throw AppError.badRequest("The team can only be changed while the booking is still on the calendar.", "NOT_EDITABLE");

  const team = staffIds.length
    ? await prisma.staff.findMany({ where: { id: { in: staffIds }, business_id: business.id, isActive: true }, select: { id: true } })
    : [];
  if (team.length !== staffIds.length) throw AppError.badRequest("One of those people isn't on your active team.", "NOT_ON_TEAM");

  await prisma.$transaction([
    prisma.appointment_staff.deleteMany({ where: { appointment_id: opened.id } }),
    prisma.appointment_staff.createMany({ data: staffIds.map((staffId) => ({ appointment_id: opened.id, staff_id: staffId })) }),
  ]);
  return { staffIds };
}
