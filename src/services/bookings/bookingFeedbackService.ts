import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import type { RateBookingInput } from "../../schemas/bookings.schema";
import { announceAvailabilityConfirmed } from "./bookingChangeAnnouncements";
import { activeAppointments, loadVisibleOrder, orderServiceNames } from "./orderStore";

// The customer telling the salon they'll attend, and reviewing a finished booking.

/** "Confirm availability": the customer will attend. Once per booking; the salon is told. */
export async function confirmAvailability(userId: string, orderId: string) {
  const rows = await loadVisibleOrder(userId, orderId);
  const active = activeAppointments(rows);
  if (active.length === 0) throw AppError.badRequest("Only an upcoming booking can be confirmed.");
  const already = active.find((r) => r.clientConfirmedAt);
  if (already) return { clientConfirmedAt: already.clientConfirmedAt };

  const clientConfirmedAt = new Date();
  await prisma.appointments.updateMany({ where: { id: { in: active.map((r) => r.id) }, clientConfirmedAt: null }, data: { clientConfirmedAt, updatedAt: clientConfirmedAt } });
  announceAvailabilityConfirmed({
    orderId, customerId: userId, businessId: rows[0].business_id!, serviceNames: orderServiceNames(active), date: active[0].date, time: active[0].time,
  });
  return { clientConfirmedAt };
}

/** The salon's average rating and review count, from its reviews (shown on its pages). */
async function refreshSalonRating(businessId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE businesses b SET performance = COALESCE(b.performance, '{}'::jsonb) || jsonb_build_object(
      'rating', COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r."businessId" = b.id), 0),
      'reviews', (SELECT COUNT(*) FROM reviews r WHERE r."businessId" = b.id)
    )
    WHERE b.id = ${businessId}::uuid`;
}

/**
 * Reviews a completed booking: the salon, and the stylist separately when one
 * was assigned. One review per booking. The customer joins the salon's client
 * list (as a website client) if they aren't on it yet.
 */
export async function rateBooking(userId: string, orderId: string, input: RateBookingInput) {
  const rows = await loadVisibleOrder(userId, orderId);
  const done = rows.find((r) => r.status === "Completed");
  if (!done) throw AppError.badRequest("You can review a booking once the appointment is completed.", "NOT_COMPLETED");
  if (await prisma.reviews.findFirst({ where: { orderId }, select: { id: true } })) {
    throw AppError.conflict("You have already reviewed this booking.", "ALREADY_REVIEWED");
  }

  const salon = done.businesses!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, surname: true, phoneNumber: true, avatarUrl: true } });
  const client = await prisma.clients.upsert({
    where: { email_owner_id: { email: user.email, owner_id: salon.owner_id } },
    create: {
      firstName: user.firstName ?? "", lastName: user.surname ?? "", email: user.email, phone: user.phoneNumber ?? "", phoneCode: "",
      clientType: "regular", clientSource: "website", owner_id: salon.owner_id, isActive: true,
    },
    update: {},
    select: { id: true },
  });

  const stylistId = done.appointment_staff[0]?.staff.id ?? null;
  const review = await prisma.reviews.create({
    data: {
      clientId: client.id,
      ownerId: salon.owner_id,
      businessId: salon.id,
      orderId,
      staffId: stylistId,
      rating: input.rating,
      // A stylist rating only means something when a stylist did it.
      staffRating: stylistId ? input.staffRating ?? null : null,
      comment: input.comment,
      service: done.serviceName,
      clientName: `${user.firstName ?? ""} ${user.surname ?? ""}`.trim() || "Customer",
      clientProfileImage: user.avatarUrl,
      clientType: "regular",
    },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });
  await refreshSalonRating(salon.id);
  return { ...review, rating: Number(review.rating) };
}
