import { z } from "zod";
import { calendarDate } from "../fields";

// A salon emailing its own clients: a message (one or many), a reminder, or a
// promotion. Recipients are client ids only — the addresses come from the
// salon's records, never from the request.

const text = (label: string, max: number) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const clientId = z.string().uuid("Please choose a valid client.");
export const CLOSINGS = ["Thank you", "Best regards", "Looking forward"] as const;

export const clientMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    clientIds: z.array(clientId).min(1, "Choose at least one client.").max(500, "Message up to 500 clients at a time.").transform((ids) => [...new Set(ids)]),
    subject: text("Subject", 150),
    message: text("Message", 2000),
    closingRemarks: z.enum(CLOSINGS).optional(),
  }),
  z.object({
    kind: z.literal("reminder"),
    clientIds: z.array(clientId).length(1, "Choose one client."),
    reminderType: z.enum(["appointment", "follow_up", "upcoming", "custom"], { error: "Choose a reminder type." }),
    date: calendarDate(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time."),
    message: text("Message", 1000),
  }),
  z.object({
    kind: z.literal("promotion"),
    clientIds: z.array(clientId).length(1, "Choose one client."),
    promotionTitle: text("Promotion title", 120),
    discountType: z.enum(["percent", "amount"]),
    discount: z.number({ error: "Discount must be a number." }).positive("Discount must be more than 0.").max(100_000),
    promotionCode: text("Promo code", 40),
    expiryDate: calendarDate(),
    description: text("Description", 1000),
  }).refine((p) => p.discountType !== "percent" || p.discount <= 100, { message: "A percentage discount can be at most 100%.", path: ["discount"] }),
]);
export type ClientMessageInput = z.infer<typeof clientMessageSchema>;
