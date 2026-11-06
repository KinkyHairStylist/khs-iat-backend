import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// vi.mock calls below are hoisted above this import, so the service sees the made-up salon.
import { nextFreeTimes } from "../src/services/customer/nextFreeService";

// "Next free" on the search cards: the earliest time the real booking check accepts. The database is
// replaced by one made-up salon; the booking check itself (evaluateSlot) is the real one.

const SALON = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";
const STYLIST = { id: "33333333-3333-4333-8333-333333333333", firstName: "Ada", lastName: "Stylist" };
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const salon = {
  rules: { minimumLeadMinutes: 0, bufferMinutes: 0, maximumAdvanceDays: 90, sameDayCutoffMinutes: null, allowDoubleBookings: false },
  hours: WEEK.map((day) => ({ day, isOpen: day !== "Sunday", startTime: "09:00:00", endTime: "17:00:00" })),
  team: [STYLIST],
};
let days: Record<string, { existing: Array<{ date: string; time: string; duration: string; staffIds: string[] }>; blocks: [] }> = {};

vi.mock("../src/lib/prisma/prisma", () => ({
  default: {
    service: {
      findMany: vi.fn(async () => [{ id: SERVICE, businessId: SALON, duration: "1h", service_staff: [{ staffId: STYLIST.id }] }]),
    },
  },
}));
vi.mock("../src/services/bookings/slotCheck", async (original) => ({
  ...(await original<typeof import("../src/services/bookings/slotCheck")>()),
  prepareSlot: vi.fn(async () => salon),
  readSalonDay: vi.fn(async (_db: unknown, _salonId: string, date: string) => days[date] ?? { existing: [], blocks: [] }),
}));


// Tuesday 10 November 2026, 10:10 on the customer's clock (UTC: offset 0).
const NOW = Date.UTC(2026, 10, 10, 10, 10);

describe("next free time for a service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    days = {};
  });
  afterEach(() => vi.useRealTimers());

  it("is the next half-hour start that is still ahead today", async () => {
    expect(await nextFreeTimes([SERVICE], 0)).toEqual({ [SERVICE]: { date: "2026-11-10", time: "10:30 AM" } });
  });

  it("skips a time the only stylist is already booked", async () => {
    days["2026-11-10"] = { existing: [{ date: "2026-11-10", time: "10:30", duration: "1h", staffIds: [STYLIST.id] }], blocks: [] };
    expect((await nextFreeTimes([SERVICE], 0))[SERVICE]).toEqual({ date: "2026-11-10", time: "11:30 AM" });
  });

  it("moves to the next open day when today is full, skipping Sunday", async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 14, 16, 30)); // Saturday, 16:30: no hour left before 17:00
    expect((await nextFreeTimes([SERVICE], 0))[SERVICE]).toEqual({ date: "2026-11-16", time: "9:00 AM" });
  });

  it("follows the salon's minimum notice", async () => {
    salon.rules.minimumLeadMinutes = 24 * 60;
    try {
      expect((await nextFreeTimes([SERVICE], 0))[SERVICE]).toEqual({ date: "2026-11-11", time: "10:30 AM" });
    } finally {
      salon.rules.minimumLeadMinutes = 0;
    }
  });

  it("uses the customer's own clock", async () => {
    // 10:10 UTC is 21:10 in Sydney (UTC+11, offset -660): the salon is closed, so tomorrow 09:00 Sydney time.
    expect((await nextFreeTimes([SERVICE], -660))[SERVICE]).toEqual({ date: "2026-11-11", time: "9:00 AM" });
  });
});
