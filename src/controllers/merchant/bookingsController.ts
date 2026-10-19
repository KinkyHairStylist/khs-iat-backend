import { idParamSchema } from "../../schemas/fields";
import {
  assignStaffSchema, availableTimesQuerySchema, completeBookingSchema, createSalonBookingSchema, dateRangeQuerySchema,
  noShowSchema, salonCancelSchema, salonRescheduleSchema,
} from "../../schemas/merchant/bookings.schema";
import { parseSchema } from "../../utils/parseSchema";
import { acceptBooking, cancelBooking, completeBooking, markNoShow } from "../../services/merchant/bookings/bookingActions";
import { assignStaff, createSalonBooking, rescheduleSalonBooking } from "../../services/merchant/bookings/bookingChanges";
import { getBookingFormOptions, getSalonBooking, listSalonBookings } from "../../services/merchant/bookings/bookingQueries";
import { listAvailableTimes } from "../../services/merchant/bookings/availableTimesService";
import { merchantHandler } from "./merchantHandler";

const bookingId = (params: unknown) => parseSchema(idParamSchema, params).id;

export const list = merchantHandler(async (req, res, userId) => {
  const { from, to } = parseSchema(dateRangeQuerySchema, req.query);
  res.success(await listSalonBookings(userId, from, to));
});

export const formOptions = merchantHandler(async (_req, res, userId) => {
  res.success(await getBookingFormOptions(userId));
});

export const availableTimes = merchantHandler(async (req, res, userId) => {
  res.success(await listAvailableTimes(userId, parseSchema(availableTimesQuerySchema, req.query)));
});

export const detail = merchantHandler(async (req, res, userId) => {
  res.success(await getSalonBooking(userId, bookingId(req.params)));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createSalonBooking(userId, parseSchema(createSalonBookingSchema, req.body)), "Booking created", 201);
});

export const accept = merchantHandler(async (req, res, userId) => {
  res.success(await acceptBooking(userId, bookingId(req.params)), "Booking accepted");
});

export const cancel = merchantHandler(async (req, res, userId) => {
  const { reason } = parseSchema(salonCancelSchema, req.body ?? {});
  res.success(await cancelBooking(userId, bookingId(req.params), reason), "Booking cancelled");
});

export const complete = merchantHandler(async (req, res, userId) => {
  res.success(await completeBooking(userId, bookingId(req.params), parseSchema(completeBookingSchema, req.body ?? {})), "Booking completed");
});

export const noShow = merchantHandler(async (req, res, userId) => {
  res.success(await markNoShow(userId, bookingId(req.params), parseSchema(noShowSchema, req.body ?? {})), "Marked as a no-show");
});

export const reschedule = merchantHandler(async (req, res, userId) => {
  res.success(await rescheduleSalonBooking(userId, bookingId(req.params), parseSchema(salonRescheduleSchema, req.body)), "Booking rescheduled");
});

export const staff = merchantHandler(async (req, res, userId) => {
  const { staffIds } = parseSchema(assignStaffSchema, req.body);
  res.success(await assignStaff(userId, bookingId(req.params), staffIds), "Team updated");
});
