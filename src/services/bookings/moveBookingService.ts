import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { parseDurationToMinutes, wallClockMs, wallClockNowMs } from "./bookingRulesCheck";
import { announceReschedule } from "./bookingChangeAnnouncements";
import { claimSlot, lockSalonDay, prepareSlot } from "./slotCheck";
import { activeAppointments, loadVisibleOrder, orderServiceNames, type OrderAppointment } from "./orderStore";

// Moving a booking to another time:
//  - reschedule: a booking still on the calendar moves (a paid one stays paid);
//  - rebook: a cancelled booking comes back at a new time, to be paid again;
//  - restore: a cancelled booking comes back at its original time, to be paid again.
// Every appointment in the order moves (the old code moved only the first).
// Coming back means held for payment like a new booking (Pending/Unpaid, the
// hold starting now) — its time is held, which the old staging didn't do.

const RESTORE_CUTOFF_HOURS = 24;

type Move = { kind: "reschedule" | "rebook" | "restore"; date: string; time: string; timezoneOffsetMinutes?: number };

async function moveOrder(userId: string, orderId: string, rows: OrderAppointment[], move: Move) {
  const salonId = rows[0].business_id!;
  const assigned = await prisma.service_staff.findMany({
    where: { serviceId: { in: rows.map((r) => r.service_id).filter((id): id is string => !!id) }, staff: { isActive: true } },
    select: { serviceId: true, staffId: true },
  });
  const assignedPerService = rows.map((r) => assigned.filter((a) => a.serviceId === r.service_id).map((a) => a.staffId));
  const durationMinutes = rows.reduce((sum, r) => sum + parseDurationToMinutes(r.duration), 0) || 30;
  // The same stylist, if there was one and they're still on the team.
  const currentStylist = rows[0].appointment_staff[0]?.staff.id ?? null;
  const prepared = await prepareSlot(salonId);
  const stillOnTeam = !!currentStylist && prepared.team.some((s) => s.id === currentStylist);
  const comesBack = move.kind !== "reschedule";
  const wasPaid = rows.some((r) => r.paymentStatus === "Paid");

  await prisma.$transaction(async (tx) => {
    await lockSalonDay(tx, salonId, move.date);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`;
    const stylist = await claimSlot(tx, {
      salonId, date: move.date, time: move.time, durationMinutes, timezoneOffsetMinutes: move.timezoneOffsetMinutes,
      staffId: stillOnTeam ? currentStylist : null, assignedPerService, excludeOrderId: orderId,
    }, prepared);

    const ids = rows.map((r) => r.id);
    const expected = comesBack ? ["Cancelled" as const] : ["Pending" as const, "Confirmed" as const, "Rescheduled" as const];
    const moved = await tx.appointments.updateMany({
      where: { id: { in: ids }, status: { in: expected } },
      data: {
        date: move.date, time: move.time, updatedAt: new Date(),
        ...(comesBack
          ? { status: "Pending", paymentStatus: "Unpaid", cancelledAt: null, createdAt: new Date(), pendingRebookDate: null, pendingRebookTime: null }
          : wasPaid
            ? { status: "Rescheduled" }
            // An unpaid booking that moves is held afresh from now.
            : { createdAt: new Date() }),
      },
    });
    if (moved.count !== ids.length) throw AppError.conflict("This booking changed a moment ago. Please refresh and try again.", "BOOKING_CHANGED");

    await tx.appointment_staff.deleteMany({ where: { appointment_id: { in: ids } } });
    if (stylist) await tx.appointment_staff.createMany({ data: ids.map((id) => ({ appointment_id: id, staff_id: stylist.id })) });
  }, MONEY_TX_OPTIONS);

  if (!comesBack && wasPaid) {
    announceReschedule({ orderId, customerId: userId, businessId: salonId, serviceNames: orderServiceNames(rows), date: move.date, time: move.time });
  }
  return { requiresPayment: comesBack || !wasPaid, businessId: salonId };
}

/** A new day and time for a booking: moves an upcoming one, or brings back a cancelled one to be paid again. */
export async function rescheduleBooking(userId: string, orderId: string, input: { date: string; time: string; timezoneOffsetMinutes?: number }) {
  const rows = await loadVisibleOrder(userId, orderId);
  const active = activeAppointments(rows);
  if (active.length > 0) return moveOrder(userId, orderId, active, { kind: "reschedule", ...input });
  if (rows.every((r) => r.status === "Cancelled")) return moveOrder(userId, orderId, rows, { kind: "rebook", ...input });
  throw AppError.badRequest("A completed booking can't be moved. Book the service again from the salon's page.", "BOOKING_FINISHED");
}

/** Brings a cancelled booking back at its original time, if that's still at least 24 hours away. */
export async function restoreBooking(userId: string, orderId: string, input: { timezoneOffsetMinutes?: number }) {
  const rows = await loadVisibleOrder(userId, orderId);
  if (!rows.every((r) => r.status === "Cancelled")) throw AppError.badRequest("Only a cancelled booking can be restored.");
  const start = wallClockMs(rows[0].date, rows[0].time);
  if (start === null || (start - wallClockNowMs(input.timezoneOffsetMinutes)) / 3_600_000 < RESTORE_CUTOFF_HOURS) {
    throw AppError.badRequest("This appointment is too close to its original time to restore. Use Rebook to pick a new time instead.", "TOO_CLOSE_TO_RESTORE");
  }
  return moveOrder(userId, orderId, rows, { kind: "restore", date: rows[0].date, time: rows[0].time, timezoneOffsetMinutes: input.timezoneOffsetMinutes });
}
