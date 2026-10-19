import { z } from "zod";
import { signupSchema } from "../auth.schema";
import { email } from "../fields";

// Merchant sign-up uses the customer steps (email → code → details) without referrals.

export const merchantEmailSchema = z.object({ email: email() });

export const merchantSignupSchema = signupSchema.omit({ referralCode: true });
export type MerchantSignupInput = z.infer<typeof merchantSignupSchema>;
