import prisma from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import { formatClock, parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { openWindow } from "../../bookings/openingHours";
import { evaluateSlot, prepareSlot, readSalonDay, type SlotRequest } from "../../bookings/slotCheck";
import { requireMerchantBusiness } from "../merchantBusiness";
import { isStillBooked, loadSalonOrder } from "./salonOrder";

// The times the salon can book on a day, for the new-booking and reschedule
// forms. Each half-hour start is put through the same check as an actual
// booking, so the form only offers times that will be accepted (the old list
// ignored the service's length, buffer time and who was free, and compared
// "2:00 PM" with "14:00" so nothing ever looked booked).

const STEP_MINUTES = 30;
// A salon that never set opening hours.
const DEFAULT_WINDOW = { open: 9 * 60, close: 17 * 60 };

interface Query {
  date: string;
  serviceId?: string;
  bookingId?: string;
  timezoneOffsetMinutes?: number;
}

/** What's being booked: its length, who can do it, and (when moving a booking) what to leave out. */
async function subjectOf(businessId: string, q: Query): Promise<Omit<SlotRequest, "salonId" | "date" | "time">> {
  if (q.serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: q.serviceId, businessId },
      select: { duration: true, service_staff: { where: { staff: { isActive: true } }, select: { staffId: true } } },
    });
    if (!service) throw AppError.notFound("Service");
    return { durationMinutes: parseDurationToMinutes(service.duration), assignedPerService: [service.service_staff.map((s) => s.staffId)] };
  }

  const order = await loadSalonOrder(businessId, q.bookingId!);
  const active = order.rows.filter(isStillBooked);
  if (active.length === 0) throw AppError.badRequest("Only a booking still on the calendar can be moved.", "NOT_MOVABLE");
  const serviceIds = active.map((r) => r.service_id).filter((x): x is string => !!x);
  const assigned = serviceIds.length
    ? await prisma.service_staff.findMany({ where: { serviceId: { in: serviceIds }, staff: { isActive: true } }, select: { serviceId: true, staffId: true } })
    : [];
  return {
    durationMinutes: active.reduce((sum, r) => sum + parseDurationToMinutes(r.duration), 0) || 30,
    assignedPerService: active.map((r) => assigned.filter((a) => a.serviceId === r.service_id).map((a) => a.staffId)),
    staffId: active[0].appointment_staff[0]?.staff.id ?? null,
    excludeOrderId: order.orderId ?? undefined,
    excludeAppointmentIds: active.map((r) => r.id),
  };
}

export async function listAvailableTimes(userId: string, q: Query): Promise<string[]> {
  const business = await requireMerchantBusiness(userId);
  const [subject, prepared] = await Promise.all([subjectOf(business.id, q), prepareSlot(business.id)]);
  // The current stylist is kept only while still on the team; otherwise anyone free.
  if (subject.staffId && !prepared.team.some((s) => s.id === subject.staffId)) subject.staffId = null;

  const window = prepared.hours.length === 0 ? DEFAULT_WINDOW : openWindow(prepared.hours, q.date);
  if (!window) return [];
  const day = await readSalonDay(prisma, business.id, q.date, { orderId: subject.excludeOrderId, appointmentIds: subject.excludeAppointmentIds });

  const times: string[] = [];
  for (let start = window.open; start + subject.durationMinutes <= window.close; start += STEP_MINUTES) {
    const time = formatClock(start);
    const outcome = evaluateSlot(
      { ...subject, salonId: business.id, date: q.date, time, timezoneOffsetMinutes: q.timezoneOffsetMinutes, asSalon: true },
      prepared,
      day,
    );
    if (!("problem" in outcome)) times.push(time);
  }
  return times;
}
