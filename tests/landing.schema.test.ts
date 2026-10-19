import { describe, expect, it } from "vitest";
import { subscribeNewsletterSchema } from "../src/schemas/customer/landing.schema";

describe("subscribeNewsletterSchema", () => {
  it("trims and lower-cases the email", () => {
    expect(subscribeNewsletterSchema.parse({ email: "  Me@Example.COM " })).toEqual({ email: "me@example.com" });
  });

  it("rejects anything that isn't an email", () => {
    expect(subscribeNewsletterSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(subscribeNewsletterSchema.safeParse({}).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(subscribeNewsletterSchema.safeParse({ email: "a@b.co", isAdmin: true }).success).toBe(false);
  });
});
