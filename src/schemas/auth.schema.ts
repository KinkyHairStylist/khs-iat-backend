import { z } from "zod";
import {
  GENDERS,
  currentPassword,
  email,
  newPassword,
  optionalReferralCode,
  otpCode,
  personName,
  phoneNumber,
  ticket,
} from "./fields";

// ─── Sign-up: email → code → details ─────────────────────────────────────────

export const getStartedSchema = z.object({
  email: email(),
  /** From a referral link (?ref=CODE). */
  refCode: optionalReferralCode(),
});
export type GetStartedInput = z.infer<typeof getStartedSchema>;

export const verifyCodeSchema = z.object({
  email: email(),
  code: otpCode(),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const signupSchema = z.object({
  /** Returned by POST /auth/verify-code; proves the email was verified just now. */
  signupToken: ticket("sign-up"),
  password: newPassword(),
  firstName: personName("First name"),
  surname: personName("Last name"),
  phoneNumber: phoneNumber(),
  gender: z.enum(GENDERS, { error: "Please choose a gender." }),
  referralCode: optionalReferralCode(),
});
export type SignupInput = z.infer<typeof signupSchema>;

// ─── Sessions ────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: email(),
  password: currentPassword(),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── Password reset: email → code → new password ─────────────────────────────

export const emailOnlySchema = z.object({ email: email() });

export const resetVerifySchema = z.object({
  email: email(),
  code: otpCode(),
});
export type ResetVerifyInput = z.infer<typeof resetVerifySchema>;

export const resetFinishSchema = z
  .object({
    email: email(),
    /** Returned by POST /auth/reset-password/verify. */
    resetToken: ticket("password reset"),
    newPassword: newPassword(),
    confirmPassword: z.string({ error: "Please confirm your new password." }),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "The passwords don't match.",
    path: ["confirmPassword"],
  });
export type ResetFinishInput = z.infer<typeof resetFinishSchema>;
