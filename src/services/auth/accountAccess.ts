import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";

// Who may use the customer site, and what of an account the customer sees.
// Shared by sign-up, sessions, password reset and the authenticate middleware.

// Matches the Kinky-Hair-Stylist backend (bcrypt, cost 10) so either service
// can verify a hash the other one wrote.
export const BCRYPT_ROUNDS = 10;

/** Redis key counting failed logins per email (cleared by a password reset). */
export const LOGIN_FAIL_PREFIX = "customer-login-fail:";

export const ACCOUNT_EXISTS_MESSAGE = "An account with this email already exists. Please log in instead.";

/** Case-insensitive — older rows weren't always lower-cased on the way in. */
export function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

type AccountFlags = { isCustomer: boolean; isStaff: boolean; isMerchant: boolean; isBusinessStaff: boolean };

/**
 * The customer site is for customer accounts. A merchant or admin account
 * signing in here would get a session every customer action refuses, so it is
 * turned away with the way to the right place. An account that is a customer
 * as well is let in. Same rule as the Kinky-Hair-Stylist backend.
 */
export function customerAccessError(user: AccountFlags): AppError | null {
  if (user.isCustomer) return null;
  if (user.isStaff) return AppError.forbidden("This is an admin account. Please sign in from the admin site.", "NOT_CUSTOMER");
  if (user.isMerchant || user.isBusinessStaff) {
    return AppError.forbidden("This is a merchant account. Please sign in as a merchant instead.", "NOT_CUSTOMER");
  }
  return null;
}

/**
 * The merchant side is for salon owners (accounts flagged isMerchant), the
 * same rule as the Kinky-Hair-Stylist backend's business login.
 */
export function merchantAccessError(user: AccountFlags): AppError | null {
  if (user.isMerchant) return null;
  if (user.isStaff) return AppError.forbidden("This is an admin account. Please sign in from the admin site.", "NOT_MERCHANT");
  return AppError.forbidden(
    "This email isn't registered as a business account. Please sign up as a merchant, or use the customer login.",
    "NOT_MERCHANT"
  );
}

/** The access rule for each kind of session. */
export const SITE_ACCESS = { customer: customerAccessError, merchant: merchantAccessError } as const;

/**
 * Whether this account may reset its password here: customers and merchants
 * (one reset flow for both), never an admin-only account.
 */
export function canUseSite(user: AccountFlags): boolean {
  return !customerAccessError(user) || user.isMerchant;
}

export function suspendedError(): AppError {
  return AppError.forbidden("Your account has been suspended. Please contact support for assistance.", "ACCOUNT_SUSPENDED");
}

/** The fields a signed-in customer sees of their own account (GET /auth/me). */
export const CUSTOMER_PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  surname: true,
  phoneNumber: true,
  gender: true,
  avatarUrl: true,
  referralCode: true,
  createdAt: true,
} as const;

export type CustomerProfile = Prisma.userGetPayload<{ select: typeof CUSTOMER_PROFILE_SELECT }>;

/** Just the profile fields of a fuller user row, so nothing else leaks into a response. */
export function toProfile<T extends CustomerProfile>(user: T): CustomerProfile {
  const profile = {} as Record<string, unknown>;
  for (const key of Object.keys(CUSTOMER_PROFILE_SELECT)) profile[key] = user[key as keyof CustomerProfile];
  return profile as CustomerProfile;
}

/** How emails greet the customer. */
export function displayName(user: { firstName: string | null; surname: string | null }): string {
  return user.firstName || user.surname || "Customer";
}
