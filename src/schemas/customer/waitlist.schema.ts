import { z } from "zod";
import { email } from "../fields";

// Who can join, and which side of the marketplace each one is on.
export const WAITLIST_ROLE_SEGMENTS = {
  Client: "demand",
  Customer: "demand",
  Hairstylist: "supply",
  Stylist: "supply",
} as const;

export type WaitlistRole = keyof typeof WAITLIST_ROLE_SEGMENTS;

const ROLES = Object.keys(WAITLIST_ROLE_SEGMENTS) as [WaitlistRole, ...WaitlistRole[]];

/** Optional free text: trimmed, cut to `max` (tracking values come from URLs we don't control), "" -> null. */
const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => v?.trim().slice(0, max) || null);

const textList = () =>
  z
    .array(z.string())
    .max(30)
    .nullish()
    .transform((list) => {
      const cleaned = (list ?? []).map((v) => v.trim().slice(0, 120)).filter(Boolean);
      return cleaned.length ? cleaned : null;
    });

/** The optional second step: what the person told us about themselves. */
const detailsSchema = z
  .object({
    hairType: text(100),
    styles: textList(),
    workSetting: text(100),
    social: text(255),
    postcode: text(50),
    city: text(120),
  })
  .default({
    hairType: null,
    styles: null,
    workSetting: null,
    social: null,
    postcode: null,
    city: null,
  });

export const waitlistSignupSchema = z.object({
  /** 1 = email + role (joins the list), 2 = optional details. */
  stage: z.union([z.literal(1), z.literal(2)]).default(1),
  /** The row stage 1 created, so going back and changing the email updates it. */
  signupId: z.string().uuid().nullish().catch(null),
  email: email(),
  role: z.enum(ROLES, { error: "Choose how you are joining." }),
  consent: z.literal(true, { error: "Tick the box so we can email you about launch." }),
  consentText: text(2000),
  launchDate: text(64),
  clientTime: text(64).transform((v) => {
    const at = v ? new Date(v) : null;
    return at && !Number.isNaN(at.getTime()) ? at : null;
  }),
  /** Honeypot: hidden from people, filled in by bots. */
  company_website: text(255),
  utm_source: text(255),
  utm_medium: text(255),
  utm_campaign: text(255),
  utm_content: text(255),
  utm_term: text(255),
  ref: text(255),
  referrer: text(2000),
  page: text(500),
  details: detailsSchema,
});

export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>;
export type WaitlistDetails = WaitlistSignupInput["details"];
