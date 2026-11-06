import prisma from "../../lib/prisma/prisma";
import { formatClock, parseDurationToMinutes, wallClockNowMs } from "../bookings/bookingRulesCheck";
import { openWindow } from "../bookings/openingHours";
import { evaluateSlot, prepareSlot, readSalonDay, type SalonDay } from "../bookings/slotCheck";

// "Next free" on the salon search cards (KHS.C.CLT.02.01): for each service on the page, the earliest
// time a customer could book it now. Each half-hour start goes through the same check as a real booking
// (opening hours, the salon's notice rules, other bookings, blocked time, who is free), so the card never
// offers a time the booking form would refuse. It looks two weeks ahead at most.

const STEP_MINUTES = 30;
const DAYS_AHEAD = 14;
const DAY_MS = 86_400_000;
// A salon that never set opening hours (as the booking forms assume).
const DEFAULT_WINDOW = { open: 9 * 60, close: 17 * 60 };

export type NextFree = { date: string; time: string } | null;

export async function nextFreeTimes(serviceIds: string[], timezoneOffsetMinutes?: number): Promise<Record<string, NextFree>> {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, businesses: { status: "approved" } },
    select: { id: true, businessId: true, duration: true, service_staff: { where: { staff: { isActive: true } }, select: { staffId: true } } },
  });
  const result: Record<string, NextFree> = Object.fromEntries(serviceIds.map((id) => [id, null]));
  // The customer's today, as their clock shows it.
  const today = wallClockNowMs(timezoneOffsetMinutes);

  const bySalon = new Map<string, typeof services>();
  for (const s of services) if (s.businessId) bySalon.set(s.businessId, [...(bySalon.get(s.businessId) ?? []), s]);

  await Promise.all(
    [...bySalon].map(async ([salonId, salonServices]) => {
      const prepared = await prepareSlot(salonId);
      const lastDay = Math.min(DAYS_AHEAD, prepared.rules.maximumAdvanceDays);
      let pending = salonServices;
      for (let d = 0; d <= lastDay && pending.length > 0; d++) {
        const date = new Date(today + d * DAY_MS).toISOString().slice(0, 10);
        const window = prepared.hours.length === 0 ? DEFAULT_WINDOW : openWindow(prepared.hours, date);
        if (!window) continue;
        let day: SalonDay | null = null;
        for (const service of pending) {
          const durationMinutes = parseDurationToMinutes(service.duration) || 30;
          for (let start = window.open; start + durationMinutes <= window.close; start += STEP_MINUTES) {
            day ??= await readSalonDay(prisma, salonId, date);
            const time = formatClock(start);
            const outcome = evaluateSlot(
              { salonId, date, time, durationMinutes, timezoneOffsetMinutes, assignedPerService: [service.service_staff.map((s) => s.staffId)] },
              prepared,
              day,
            );
            if (!("problem" in outcome)) {
              result[service.id] = { date, time };
              break;
            }
          }
        }
        pending = pending.filter((s) => result[s.id] === null);
      }
    }),
  );
  return result;
}
