import crypto from "crypto";
import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import type { CreateBookingInput } from "../../schemas/bookings.schema";
import { parseDurationToMinutes } from "./bookingRulesCheck";
import { claimSlot, lockSalonDay, prepareSlot } from "./slotCheck";

// Creating a booking: one Pending/Unpaid appointment per service under one
// order id, holding the time while the customer pays. Prices always come from
// the database — nothing the browser sends decides what's charged.

type TxClient = Prisma.TransactionClient;

async function loadServices(salonId: string, serviceIds: string[]) {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, businessId: salonId },
    select: {
      id: true, name: true, price: true, minPrice: true, maxPrice: true, duration: true,
      service_staff: { where: { staff: { isActive: true } }, select: { staffId: true } },
    },
  });
  // A service from another salon (or one that no longer exists) can't be booked here.
  if (services.length !== serviceIds.length) {
    throw AppError.badRequest("One of the services you picked isn't offered by this salon any more. Please refresh and try again.");
  }
  return serviceIds.map((id) => services.find((s) => s.id === id)!).map((s) => {
    // Variable-priced services keep their range on min/max; the booking holds the lowest.
    const amount = s.price ?? s.minPrice ?? s.maxPrice;
    if (amount === null) {
      throw AppError.badRequest(`"${s.name ?? "This service"}" doesn't have a price yet, so it can't be booked online. Please contact the salon.`);
    }
    return { ...s, amount: Number(amount), assignedIds: s.service_staff.map((x) => x.staffId) };
  });
}

/** BKID-1234567, unused. */
export async function newOrderId(tx: TxClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderId = `BKID-${crypto.randomInt(1_000_000, 10_000_000)}`;
    if (!(await tx.appointments.findFirst({ where: { orderId }, select: { id: true } }))) return orderId;
  }
  throw AppError.internal();
}

export async function createBooking(userId: string, input: CreateBookingInput) {
  const salon = await prisma.businesses.findFirst({ where: { id: input.salonId, status: "approved" }, select: { id: true } });
  if (!salon) throw AppError.notFound("Salon");

  const services = await loadServices(input.salonId, input.serviceIds);
  const durationMinutes = services.reduce((sum, s) => sum + parseDurationToMinutes(s.duration), 0) || 30;
  const prepared = await prepareSlot(input.salonId);

  return prisma.$transaction(async (tx) => {
    await lockSalonDay(tx, input.salonId, input.date);
    const stylist = await claimSlot(tx, {
      salonId: input.salonId, date: input.date, time: input.time, durationMinutes,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes, staffId: input.staffId,
      assignedPerService: services.map((s) => s.assignedIds),
    }, prepared);

    const orderId = await newOrderId(tx);
    const stylistId = stylist?.id;
    const appointments = services.map((service) => ({
      id: crypto.randomUUID(),
      orderId,
      client_id: userId,
      business_id: input.salonId,
      service_id: service.id,
      serviceName: service.name ?? "Service",
      date: input.date,
      time: input.time,
      duration: service.duration ?? "30",
      amount: service.amount,
      status: "Pending" as const,
      paymentStatus: "Unpaid" as const,
    }));
    await tx.appointments.createMany({ data: appointments });
    if (stylistId) {
      await tx.appointment_staff.createMany({ data: appointments.map((a) => ({ appointment_id: a.id, staff_id: stylistId })) });
    }
    return { orderId };
  }, MONEY_TX_OPTIONS);
}
