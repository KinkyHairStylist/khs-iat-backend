import { z } from "zod";
import { appointmentTime, calendarDate, email, timezoneOffset } from "./fields";

// Booking and paying for an appointment.

export const createBookingSchema = z.object({
  salonId: z.string().uuid("We couldn't find that salon. Please refresh and try again."),
  serviceIds: z
    .array(z.string().uuid("One of the services isn't valid. Please refresh and try again."))
    .min(1, "Please pick at least one service.")
    .max(10, "You can book up to 10 services at once.")
    .transform((ids) => [...new Set(ids)]),
  date: calendarDate(),
  time: appointmentTime(),
  timezoneOffsetMinutes: timezoneOffset,
  // Left out for "any stylist".
  staffId: z.string().uuid("Please choose a valid stylist.").optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// BKID-1234567 (older orders may use other prefixes, so only the shape is checked).
export const orderIdSchema = z.object({ orderId: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/) });

const giftCardCode = z.string().trim().min(1).max(50);

/** Start paying: by card (optionally a 50% deposit), with a gift card, with a membership, or nothing for a free booking. */
export const startPaymentSchema = z
  .object({
    depositOnly: z.boolean().default(false),
    giftCard: giftCardCode.optional(),
    // Sessions from a membership the customer owns pay for the booking instead.
    membershipPurchaseId: z.string().uuid("We couldn't find that membership. Please refresh and try again.").optional(),
  })
  .refine((v) => !v.membershipPurchaseId || (!v.depositOnly && !v.giftCard), {
    message: "A membership pays for the whole booking, so it can't be combined with a deposit or a gift card.",
  });
export type StartPaymentInput = z.infer<typeof startPaymentSchema>;

export const validateGiftCardSchema = z.object({
  code: giftCardCode,
  businessId: z.string().uuid().optional(),
});

export const purchasePackageSchema = z.object({ packageId: z.string().uuid("We couldn't find that package. Please refresh and try again.") });
// A blank field on the "Sending to someone" form means "not given".
const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional().transform((v) => v || undefined);

export const purchaseGiftCardSchema = z.object({
  giftCardId: z.string().uuid("We couldn't find that gift card. Please refresh and try again."),
  // Optional: who the card is for. With an email, the card is emailed to them too.
  recipientName: optionalText("Recipient name", 80),
  recipientEmail: z.union([z.literal("").transform(() => undefined), email()]).optional(),
  senderName: optionalText("Your name", 80),
  // Stripe keeps each detail to 500 characters.
  message: optionalText("Message", 500),
});
export type GiftCardRecipient = Partial<Omit<z.infer<typeof purchaseGiftCardSchema>, "giftCardId">>;
// A Stripe payment id.
export const paymentReferenceSchema = z.object({ reference: z.string().trim().regex(/^pi_[A-Za-z0-9]{8,64}$/, "We couldn't find that payment.") });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(1000, "Please keep the reason to 1000 characters or fewer.").optional(),
  acceptedTerms: z.literal(true, { message: "Please accept the cancellation terms to continue." }),
  timezoneOffsetMinutes: timezoneOffset,
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

/** A new day and time for a booking (reschedule, or rebook a cancelled one). */
export const rescheduleSchema = z.object({
  date: calendarDate(),
  time: appointmentTime(),
  timezoneOffsetMinutes: timezoneOffset,
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const restoreSchema = z.object({ timezoneOffsetMinutes: timezoneOffset });

export const rateBookingSchema = z.object({
  rating: z.number().int().min(1, "Please choose a rating from 1 to 5.").max(5, "Please choose a rating from 1 to 5."),
  comment: z.string().trim().max(2000, "Please keep your review to 2000 characters or fewer.").default(""),
  // The stylist who did it, rated separately (only when one was assigned).
  staffRating: z.number().int().min(1).max(5).optional(),
});
export type RateBookingInput = z.infer<typeof rateBookingSchema>;
