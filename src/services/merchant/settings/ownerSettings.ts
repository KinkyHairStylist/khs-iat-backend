import prisma from "../../../lib/prisma/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { BookingRulesInput } from "../../../schemas/merchant/settings.schema";
import { requireMerchantBusiness } from "../merchantBusiness";

// The salon's settings: alerts, booking rules, cancellation window and deposit.
// The booking flow reads lead time, buffer and the cancellation window from the
// salon's booking policies (set at sign-up), so changes are written to both in
// one transaction and the two never disagree. Never returned: the API key and
// the connected-app flags (Settings > Integrations has its own status).

const SELECT = {
  notificationsBusinessNotificationsNewbookingalerts: true,
  notificationsBusinessNotificationsCancellationalerts: true,
  bookingRulesMinimumleadtimehours: true,
  bookingRulesBuffertimebetweenappointmentsminutes: true,
  bookingRulesMaximumadvancebookingdays: true,
  bookingRulesSamedaybookingcutoff: true,
  bookingRulesAllowdoublebookings: true,
  pricingPoliciesCancellationwindow: true,
  pricingPoliciesAllowdepositpayment: true,
} satisfies Prisma.business_owner_settingsSelect;

/** The settings row, created with the defaults the first time. */
async function ensureSettings(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const row =
    (await prisma.business_owner_settings.findUnique({ where: { businessId: business.id }, select: SELECT })) ??
    (await prisma.business_owner_settings.upsert({ where: { businessId: business.id }, create: { businessId: business.id, ownerId: business.ownerId }, update: {}, select: SELECT }));
  return { business, row };
}

export async function getSettings(userId: string) {
  const { business, row } = await ensureSettings(userId);
  const policies = await prisma.booking_policies.findUnique({ where: { businessId: business.id }, select: { minimumLeadTime: true, bufferTime: true, cancellationWindow: true } });
  return {
    notifications: {
      newBookingAlerts: row.notificationsBusinessNotificationsNewbookingalerts,
      cancellationAlerts: row.notificationsBusinessNotificationsCancellationalerts,
    },
    bookingRules: {
      minimumLeadTimeMinutes: policies?.minimumLeadTime ?? row.bookingRulesMinimumleadtimehours * 60,
      bufferTimeBetweenAppointmentsMinutes: policies?.bufferTime ?? row.bookingRulesBuffertimebetweenappointmentsminutes,
      maximumAdvanceBookingDays: row.bookingRulesMaximumadvancebookingdays,
      sameDayBookingCutoff: row.bookingRulesSamedaybookingcutoff ?? "",
      allowDoubleBookings: row.bookingRulesAllowdoublebookings,
    },
    cancellationWindow: policies?.cancellationWindow ?? row.pricingPoliciesCancellationwindow ?? 24,
    // Unset means offered, as checkout treats it.
    allowDepositPayment: row.pricingPoliciesAllowdepositpayment ?? true,
  };
}

async function update(userId: string, data: Prisma.business_owner_settingsUpdateInput, policies?: Prisma.booking_policiesUpdateManyMutationInput) {
  const { business } = await ensureSettings(userId);
  await prisma.$transaction(async (tx) => {
    await tx.business_owner_settings.update({ where: { businessId: business.id }, data: { ...data, updatedAt: new Date() } });
    if (policies) await tx.booking_policies.updateMany({ where: { businessId: business.id }, data: policies });
  });
  return getSettings(userId);
}

export const saveNotifications = (userId: string, input: { newBookingAlerts: boolean; cancellationAlerts: boolean }) =>
  update(userId, {
    notificationsBusinessNotificationsNewbookingalerts: input.newBookingAlerts,
    notificationsBusinessNotificationsCancellationalerts: input.cancellationAlerts,
  });

export const saveBookingRules = (userId: string, input: BookingRulesInput) =>
  update(
    userId,
    {
      bookingRulesMinimumleadtimehours: Math.ceil(input.minimumLeadTimeMinutes / 60),
      bookingRulesBuffertimebetweenappointmentsminutes: input.bufferTimeBetweenAppointmentsMinutes,
      bookingRulesMaximumadvancebookingdays: input.maximumAdvanceBookingDays,
      bookingRulesSamedaybookingcutoff: input.sameDayBookingCutoff || null,
      bookingRulesAllowdoublebookings: input.allowDoubleBookings,
    },
    { minimumLeadTime: input.minimumLeadTimeMinutes, bufferTime: input.bufferTimeBetweenAppointmentsMinutes },
  );

export const saveCancellationWindow = (userId: string, hours: number) =>
  update(userId, { pricingPoliciesCancellationwindow: hours }, { cancellationWindow: hours });

export const saveDepositSetting = (userId: string, allow: boolean) => update(userId, { pricingPoliciesAllowdepositpayment: allow });
