import { z } from "zod";

// Field rules shared by every customer schema, so an email or password is
// held to the same standard everywhere (sign-up, login, reset, profile).

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one lower, one upper, one digit, one special character — the same
// rule the sign-up form's strength meter shows.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).+$/;
const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;

/** Trimmed and lower-cased, so "Jane@X.com " and "jane@x.com" are one account. */
export const email = () =>
  z
    .string({ error: "Email is required." })
    .trim()
    .max(254, "That email address is too long.")
    .regex(EMAIL_REGEX, "Please enter a valid email address.")
    .transform((v) => v.toLowerCase());

/** A password being set (sign-up, reset, change). */
export const newPassword = () =>
  z
    .string({ error: "Password is required." })
    .min(8, "Password must be at least 8 characters.")
    // bcrypt only uses the first 72 bytes.
    .max(72, "Password must be at most 72 characters.")
    .regex(PASSWORD_REGEX, "Password must include an uppercase letter, a lowercase letter, a number and a special character.");

/** A password being checked (login): any length, never echoed back. */
export const currentPassword = () => z.string({ error: "Password is required." }).min(1, "Password is required.").max(200);

export const personName = (label: string) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(50, `${label} must be 50 characters or fewer.`);

export const phoneNumber = () =>
  z
    .string({ error: "Phone number is required." })
    .trim()
    .regex(PHONE_REGEX, "Please enter a valid phone number, e.g. +44 7700 900123.");

/** The 5-digit codes emailed for sign-up and password reset. */
export const otpCode = () =>
  z
    .string({ error: "Please enter the code." })
    .trim()
    .regex(/^\d{5}$/, "Please enter the 5-digit code from your email.");

/** Opaque single-use tokens issued by lib/redis/codeStore. */
export const ticket = (label: string) =>
  z
    .string({ error: `Your ${label} session has expired. Please start again.` })
    .trim()
    .regex(/^[A-Za-z0-9_-]{40,60}$/, `Your ${label} session has expired. Please start again.`);

// Same values as the shared database's user.gender.
export const GENDERS = ["MALE", "FEMALE", "CUSTOM", "PREFER_NOT_TO_SAY", "OTHER"] as const;

/** Referral codes are 16 upper-case hex characters; empty means none. */
export const optionalReferralCode = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .max(32)
    .optional()
    .transform((v) => (v ? v : undefined));

/** A record id in a URL (/:id). */
export const idParamSchema = z.object({
  id: z.string().uuid("We couldn't find that. Please refresh and try again."),
});

/** ?page=&limit= for paged lists. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});

const isRealDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** A calendar date, "2026-01-31". */
export const calendarDate = (message = "Please choose a valid date.") =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message).refine(isRealDate, message);

/** An appointment time the way the booking calendar shows and stores it: "9:00 AM". */
export const appointmentTime = () => z.string().trim().regex(/^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/, "Please choose a valid time.");

/** The browser's Date.getTimezoneOffset(), so "now" is the person's now, not the server's. */
export const timezoneOffset = z.number().int().min(-14 * 60).max(14 * 60).optional();
