import { Request } from "express";
import { AppError } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { customerHandler } from "../customerHandler";
import {
  cancelBookingSchema, createBookingSchema, orderIdSchema, rateBookingSchema, rescheduleSchema, restoreSchema, startPaymentSchema,
} from "../../schemas/bookings.schema";
import { createBooking as create } from "../../services/bookings/createBookingService";
import { getCustomerBooking } from "../../services/bookings/bookingQueryService";
import { abandonBooking, completeCardPayment, startPayment } from "../../services/bookings/paymentService";
import { listMyAppointments } from "../../services/bookings/myBookingsService";
import { cancelBooking } from "../../services/bookings/cancelBookingService";
import { rescheduleBooking, restoreBooking } from "../../services/bookings/moveBookingService";
import { confirmAvailability, rateBooking } from "../../services/bookings/bookingFeedbackService";

/** The order id from the URL; one that can't be real is "not found". */
function orderIdParam(req: Request): string {
  const parsed = orderIdSchema.safeParse(req.params);
  if (!parsed.success) throw AppError.notFound("Booking");
  return parsed.data.orderId;
}

export const createBooking = customerHandler(async (req, res, userId) => {
  res.success(await create(userId, parseSchema(createBookingSchema, req.body)), "Your time is held while you pay.", 201);
});

export const getBooking = customerHandler(async (req, res, userId) => {
  res.success(await getCustomerBooking(userId, orderIdParam(req)));
});

export const pay = customerHandler(async (req, res, userId) => {
  const result = await startPayment(userId, orderIdParam(req), parseSchema(startPaymentSchema, req.body ?? {}));
  res.success(result, result.kind === "confirmed" ? "Booking confirmed." : "Payment started.");
});

export const completePayment = customerHandler(async (req, res, userId) => {
  const result = await completeCardPayment(userId, orderIdParam(req));
  res.success(result, result.confirmed ? "Payment completed. Your booking is confirmed." : "Your payment is still processing.");
});

export const abandon = customerHandler(async (req, res, userId) => {
  await abandonBooking(userId, orderIdParam(req));
  res.success(null, "Booking cancelled. The time has been released.");
});

export const listBookings = customerHandler(async (_req, res, userId) => {
  res.success(await listMyAppointments(userId));
});

export const cancel = customerHandler(async (req, res, userId) => {
  const result = await cancelBooking(userId, orderIdParam(req), parseSchema(cancelBookingSchema, req.body));
  res.success(result, "Booking cancelled.");
});

export const reschedule = customerHandler(async (req, res, userId) => {
  const result = await rescheduleBooking(userId, orderIdParam(req), parseSchema(rescheduleSchema, req.body));
  res.success(result, result.requiresPayment ? "New time held — complete payment to confirm it." : "Booking rescheduled.");
});

export const restore = customerHandler(async (req, res, userId) => {
  const result = await restoreBooking(userId, orderIdParam(req), parseSchema(restoreSchema, req.body ?? {}));
  res.success(result, "Booking restored — complete payment to confirm it.");
});

export const confirmAttendance = customerHandler(async (req, res, userId) => {
  res.success(await confirmAvailability(userId, orderIdParam(req)), "Availability confirmed.");
});

export const review = customerHandler(async (req, res, userId) => {
  res.success(await rateBooking(userId, orderIdParam(req), parseSchema(rateBookingSchema, req.body)), "Thanks for your review!", 201);
});
