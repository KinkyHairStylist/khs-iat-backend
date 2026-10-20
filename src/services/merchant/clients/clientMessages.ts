import prisma from "../../../lib/prisma/prisma";
import redis from "../../../lib/redis/redis";
import { CLIENT_MESSAGES_PER_DAY } from "../../../config/env";
import { salonMessageEmail, salonPromotionEmail, salonReminderEmail } from "../../../emails";
import type { RenderedEmail } from "../../../emails";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import { AppError } from "../../../middlewares/centralAppError";
import type { ClientMessageInput } from "../../../schemas/merchant/clientMessages.schema";
import { formatClock } from "../../bookings/bookingRulesCheck";
import { parseClockToMinutes } from "../../bookings/bookingRules";
import { formatMoney } from "../../../utils/money";
import { requireMerchantBusiness, type MerchantBusiness } from "../merchantBusiness";

// A salon emailing its own clients. Only the salon's active clients, at the
// address on their record, under the salon's own name, with replies going to
// the owner. A client who turned email off isn't sent messages or reminders;
// promotions go only to clients who agreed to marketing emails. Each salon
// has a daily limit. (The old endpoints took the address, phone and business
// from the request, so anyone could send as any salon to anyone.)

const REMINDER_HEADINGS = { appointment: "Appointment reminder", follow_up: "Follow-up", upcoming: "Upcoming reminder", custom: "Reminder" } as const;

interface Recipient { id: string; name: string; email: string; emailOk: boolean; marketingOk: boolean }

async function recipients(ownerId: string, ids: string[]): Promise<Recipient[]> {
  const rows = await prisma.clients.findMany({
    where: { id: { in: ids }, owner_id: ownerId, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, client_settings: { select: { emailNotifications: true, marketingEmails: true } } },
  });
  if (rows.length !== ids.length) throw AppError.badRequest("One of those clients isn't on your list.", "NOT_YOUR_CLIENT");
  return rows.map((c) => ({
    id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email,
    emailOk: c.client_settings?.emailNotifications !== false, marketingOk: c.client_settings?.marketingEmails === true,
  }));
}

/** Counts the sends against today's limit (atomic); refuses past it. */
async function useQuota(businessId: string, count: number) {
  const key = `client-messages:${businessId}:${new Date().toISOString().slice(0, 10)}`;
  const used = await redis.incrby(key, count);
  if (used === count) await redis.expire(key, 2 * 86_400);
  if (used > CLIENT_MESSAGES_PER_DAY) {
    await redis.decrby(key, count);
    throw new AppError(`You can send up to ${CLIENT_MESSAGES_PER_DAY} client emails a day. Please try again tomorrow.`, 429, "DAILY_LIMIT");
  }
}

async function ownerEmail(business: MerchantBusiness) {
  const row = await prisma.businesses.findUnique({ where: { id: business.id }, select: { ownerEmail: true } });
  return row?.ownerEmail || (await prisma.user.findUnique({ where: { id: business.ownerId }, select: { email: true } }))?.email || undefined;
}

const longDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function sendClientMessage(userId: string, input: ClientMessageInput) {
  const business = await requireMerchantBusiness(userId);
  const list = await recipients(business.ownerId, input.clientIds);
  const allowed = list.filter((r) => (input.kind === "promotion" ? r.marketingOk : r.emailOk));
  const skipped = list.filter((r) => !allowed.includes(r)).map((r) => ({ id: r.id, name: r.name, reason: input.kind === "promotion" ? "no-marketing" : "email-off" }));
  if (allowed.length === 0) {
    throw AppError.badRequest(
      input.kind === "promotion" ? "This client hasn't agreed to marketing emails." : "These clients have email notifications turned off.",
      "NO_RECIPIENTS",
    );
  }
  await useQuota(business.id, allowed.length);

  const replyTo = await ownerEmail(business);
  const base = { businessName: business.businessName };
  const emailFor = (r: Recipient): RenderedEmail => {
    if (input.kind === "message") return salonMessageEmail({ ...base, clientName: r.name, subject: input.subject, message: input.message, closing: input.closingRemarks });
    if (input.kind === "reminder") {
      const when = `${longDate(input.date)} at ${formatClock(parseClockToMinutes(input.time) ?? 0)}`;
      return salonReminderEmail({ ...base, clientName: r.name, heading: REMINDER_HEADINGS[input.reminderType], message: input.message, when });
    }
    const offer = input.discountType === "percent" ? `${input.discount}% OFF` : `${formatMoney(input.discount)} OFF`;
    return salonPromotionEmail({ ...base, clientName: r.name, title: input.promotionTitle, offer, code: input.promotionCode, expires: longDate(input.expiryDate), description: input.description });
  };
  for (const r of allowed) sendEmailInBackground({ to: r.email, ...emailFor(r), replyTo });

  await record(business.id, input, allowed);
  return { sent: allowed.length, skipped };
}

/** The send, in the history table for its kind. */
async function record(businessId: string, input: ClientMessageInput, sentTo: Recipient[]) {
  if (input.kind === "message") {
    const one = sentTo.length === 1 ? sentTo[0] : null;
    await prisma.communications.create({
      data: {
        businessId, clientId: one?.id, clientName: one?.name, clientEmail: one?.email, message: input.message, messageSubject: input.subject,
        recipients: one ? undefined : sentTo.map((r) => ({ clientId: r.id, clientName: r.name, clientEmail: r.email })), messageType: "email", sent: true,
      },
    });
  } else if (input.kind === "reminder") {
    const r = sentTo[0];
    await prisma.reminders.create({
      data: { businessId, clientId: r.id, clientName: r.name, clientEmail: r.email, date: input.date, time: input.time, message: input.message, mode: "email", reminderType: input.reminderType, sent: true },
    });
  } else {
    const r = sentTo[0];
    await prisma.promotions.create({
      data: {
        businessId, clientId: r.id, clientName: r.name, clientEmail: r.email, discount: String(input.discount), discountType: input.discountType === "percent" ? "percent" : "fixed",
        promotionTitle: input.promotionTitle, promotionCode: input.promotionCode, expiryDate: input.expiryDate, description: input.description, sent: true,
      },
    });
  }
}
