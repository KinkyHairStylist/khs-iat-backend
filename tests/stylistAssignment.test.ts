import { describe, expect, it } from "vitest";
import { chooseStylist, eligibleStylists } from "../src/services/bookings/stylistAssignment";

const ann = { id: "a", firstName: "Ann", lastName: "Lee" };
const bob = { id: "b", firstName: "Bob", lastName: "Ray" };
const slot = { startMinutes: 600, durationMinutes: 60, bufferMinutes: 0 };

describe("eligibleStylists", () => {
  it("narrows by each service's assigned staff; unassigned means anyone", () => {
    expect(eligibleStylists([ann, bob], [["a"], []])).toEqual([ann]);
    expect(eligibleStylists([ann, bob], [[]])).toEqual([ann, bob]);
    expect(eligibleStylists([ann, bob], [["a"], ["b"]])).toEqual([]);
  });
});

describe("chooseStylist", () => {
  const busyAnn = [{ time: "10:00 AM", duration: "60", staffIds: ["a"] }];
  it("refuses a requested stylist who can't do it or is busy", () => {
    expect(chooseStylist({ requestedId: "x", candidates: [ann], slot, appointments: [], blocks: [], allowDoubleBookings: false })).toEqual({ ok: false, reason: "not-eligible" });
    expect(chooseStylist({ requestedId: "a", candidates: [ann], slot, appointments: busyAnn, blocks: [], allowDoubleBookings: false })).toEqual({ ok: false, reason: "busy" });
  });
  it("any stylist: the free one", () => {
    expect(chooseStylist({ candidates: [ann, bob], slot, appointments: busyAnn, blocks: [], allowDoubleBookings: false })).toEqual({ ok: true, stylist: bob });
  });
  it("a block by full name, or for everyone", () => {
    const blocks = [{ startTime: "10:00:00", endTime: "11:00:00", teamMember: "Bob Ray" }];
    expect(chooseStylist({ candidates: [bob, ann], slot, appointments: [], blocks, allowDoubleBookings: false })).toEqual({ ok: true, stylist: ann });
    const all = [{ startTime: "10:00:00", endTime: "11:00:00", teamMember: "All" }];
    expect(chooseStylist({ candidates: [ann, bob], slot, appointments: [], blocks: all, allowDoubleBookings: false })).toEqual({ ok: true, stylist: null });
  });
  it("prefers whoever has fewer appointments that day", () => {
    const appts = [{ time: "2:00 PM", duration: "30", staffIds: ["a"] }];
    expect(chooseStylist({ candidates: [ann, bob], slot, appointments: appts, blocks: [], allowDoubleBookings: false })).toEqual({ ok: true, stylist: bob });
  });
});
