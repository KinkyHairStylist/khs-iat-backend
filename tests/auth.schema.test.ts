import { describe, expect, it } from "vitest";
import { getStartedSchema, loginSchema, resetFinishSchema, signupSchema, verifyCodeSchema } from "../src/schemas/auth.schema";

const TOKEN = "a".repeat(43);
const validSignup = {
  signupToken: TOKEN,
  password: "Str0ng!Pass",
  firstName: " Jane ",
  surname: "Doe",
  phoneNumber: "+44 7700 900123",
  gender: "FEMALE",
};

describe("auth schemas", () => {
  it("normalises emails and referral codes", () => {
    expect(getStartedSchema.parse({ email: " Jane@Example.COM ", refCode: "ab12" })).toEqual({ email: "jane@example.com", refCode: "AB12" });
    expect(getStartedSchema.parse({ email: "a@b.co", refCode: "" }).refCode).toBeUndefined();
  });

  it("accepts only 5-digit codes", () => {
    expect(verifyCodeSchema.safeParse({ email: "a@b.co", code: "12345" }).success).toBe(true);
    expect(verifyCodeSchema.safeParse({ email: "a@b.co", code: "1234" }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ email: "a@b.co", code: "12a45" }).success).toBe(false);
  });

  it("requires a strong password on sign-up", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
    for (const password of ["short1!", "alllowercase1!", "ALLUPPER1!", "NoDigits!!", "NoSpecial123", "x".repeat(73) + "A1!"]) {
      expect(signupSchema.safeParse({ ...validSignup, password }).success, password).toBe(false);
    }
  });

  it("trims names and checks phone numbers and genders", () => {
    expect(signupSchema.parse(validSignup).firstName).toBe("Jane");
    expect(signupSchema.safeParse({ ...validSignup, phoneNumber: "call me" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, gender: "ROBOT" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, firstName: "   " }).success).toBe(false);
  });

  it("rejects malformed sign-up tokens", () => {
    expect(signupSchema.safeParse({ ...validSignup, signupToken: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, signupToken: "a".repeat(40) + "<>!" }).success).toBe(false);
  });

  it("lets any password through to login (strength is only checked when setting one)", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("requires the reset confirmation to match", () => {
    const base = { email: "a@b.co", resetToken: TOKEN, newPassword: "N3w!Password" };
    expect(resetFinishSchema.safeParse({ ...base, confirmPassword: "N3w!Password" }).success).toBe(true);
    expect(resetFinishSchema.safeParse({ ...base, confirmPassword: "Other!Pass1" }).success).toBe(false);
  });
});
