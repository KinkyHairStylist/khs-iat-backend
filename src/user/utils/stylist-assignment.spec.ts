import { chooseStylist, eligibleStylists, isStylistFree, Stylist } from './stylist-assignment';

const ada: Stylist = { id: 'ada', firstName: 'Ada', lastName: 'Obi', isActive: true };
const bo: Stylist = { id: 'bo', firstName: 'Bo', lastName: 'Lee', isActive: true };
const cy: Stylist = { id: 'cy', firstName: 'Cy', lastName: 'Ng', isActive: false };

const slot = { startMinutes: 10 * 60, durationMinutes: 60, bufferMinutes: 0 }; // 10:00 to 11:00

describe('who can do a booking', () => {
  it('leaves out staff who are not active', () => {
    expect(eligibleStylists([ada, bo, cy], []).map((s) => s.id)).toEqual(['ada', 'bo']);
  });

  it('narrows to the people a service is assigned to', () => {
    expect(eligibleStylists([ada, bo], [{ assignedStaff: [bo] }]).map((s) => s.id)).toEqual(['bo']);
  });

  it('lets anyone do a service nobody is assigned to', () => {
    expect(eligibleStylists([ada, bo], [{ assignedStaff: [] }, { assignedStaff: null }]).map((s) => s.id)).toEqual(['ada', 'bo']);
  });

  it('needs someone who can do every service picked', () => {
    const both = eligibleStylists([ada, bo], [{ assignedStaff: [ada, bo] }, { assignedStaff: [bo] }]);
    expect(both.map((s) => s.id)).toEqual(['bo']);
    expect(eligibleStylists([ada, bo], [{ assignedStaff: [ada] }, { assignedStaff: [bo] }])).toEqual([]);
  });

  it('does not count an inactive person a service is assigned to', () => {
    expect(eligibleStylists([ada, cy], [{ assignedStaff: [cy] }])).toEqual([]);
  });
});

describe('whether a stylist is free', () => {
  it('is free with nothing on', () => {
    expect(isStylistFree(ada, slot, [], [])).toBe(true);
  });

  it('is busy when one of their appointments overlaps', () => {
    expect(isStylistFree(ada, slot, [{ time: '10:30 AM', duration: '60 mins', staffIds: ['ada'] }], [])).toBe(false);
  });

  it("is not affected by someone else's appointment", () => {
    expect(isStylistFree(ada, slot, [{ time: '10:00 AM', duration: '60 mins', staffIds: ['bo'] }], [])).toBe(true);
  });

  it('is free when an appointment ends exactly as this one starts, and busy with a buffer', () => {
    const before = [{ time: '9:00 AM', duration: '60 mins', staffIds: ['ada'] }];
    expect(isStylistFree(ada, slot, before, [])).toBe(true);
    expect(isStylistFree(ada, { ...slot, bufferMinutes: 15 }, before, [])).toBe(false);
  });

  it('is busy when time is blocked off for them by name, or for everyone', () => {
    expect(isStylistFree(ada, slot, [], [{ startTime: '10:15:00', endTime: '11:00:00', teamMember: 'ada obi' }])).toBe(false);
    expect(isStylistFree(ada, slot, [], [{ startTime: '10:15:00', endTime: '11:00:00', teamMember: 'All Team Members' }])).toBe(false);
    expect(isStylistFree(ada, slot, [], [{ startTime: '10:15:00', endTime: '11:00:00', teamMember: '' }])).toBe(false);
  });

  it('is free when the blocked time is for someone else', () => {
    expect(isStylistFree(ada, slot, [], [{ startTime: '10:00:00', endTime: '11:00:00', teamMember: 'Bo Lee' }])).toBe(true);
  });
});

describe('choosing the stylist', () => {
  const busyAda = [{ time: '10:00 AM', duration: '60 mins', staffIds: ['ada'] }];

  it("gives a customer the stylist they asked for", () => {
    const r = chooseStylist({ requestedId: 'bo', candidates: [ada, bo], slot, appointments: [], blocks: [], allowDoubleBookings: false });
    expect(r).toEqual({ ok: true, stylist: bo });
  });

  it("refuses a stylist who can't do the services", () => {
    const r = chooseStylist({ requestedId: 'ada', candidates: [bo], slot, appointments: [], blocks: [], allowDoubleBookings: false });
    expect(r).toEqual({ ok: false, reason: 'not-eligible' });
  });

  it('refuses a stylist who is busy then', () => {
    const r = chooseStylist({ requestedId: 'ada', candidates: [ada, bo], slot, appointments: busyAda, blocks: [], allowDoubleBookings: false });
    expect(r).toEqual({ ok: false, reason: 'busy' });
  });

  it('lets a busy stylist be booked when the salon allows double bookings', () => {
    const r = chooseStylist({ requestedId: 'ada', candidates: [ada, bo], slot, appointments: busyAda, blocks: [], allowDoubleBookings: true });
    expect(r).toEqual({ ok: true, stylist: ada });
  });

  it('with "any stylist", picks someone who is free', () => {
    const r = chooseStylist({ candidates: [ada, bo], slot, appointments: busyAda, blocks: [], allowDoubleBookings: false });
    expect(r).toEqual({ ok: true, stylist: bo });
  });

  it('with "any stylist", spreads the day: the one with fewest appointments', () => {
    const day = [
      { time: '8:00 AM', duration: '30 mins', staffIds: ['ada'] },
      { time: '9:00 AM', duration: '30 mins', staffIds: ['ada'] },
      { time: '8:00 AM', duration: '30 mins', staffIds: ['bo'] },
    ];
    const r = chooseStylist({ candidates: [ada, bo], slot, appointments: day, blocks: [], allowDoubleBookings: false });
    expect(r).toEqual({ ok: true, stylist: bo });
  });

  it('leaves the booking unassigned when nobody can be assigned', () => {
    expect(chooseStylist({ candidates: [], slot, appointments: [], blocks: [], allowDoubleBookings: false })).toEqual({ ok: true, stylist: null });
  });

  it('leaves it unassigned when everyone is busy and double bookings are off', () => {
    const allBusy = [{ time: '10:00 AM', duration: '60 mins', staffIds: ['ada', 'bo'] }];
    expect(chooseStylist({ candidates: [ada, bo], slot, appointments: allBusy, blocks: [], allowDoubleBookings: false })).toEqual({ ok: true, stylist: null });
  });

  it('when everyone is busy but double bookings are allowed, picks the least busy', () => {
    const day = [
      { time: '10:00 AM', duration: '60 mins', staffIds: ['ada'] },
      { time: '10:00 AM', duration: '60 mins', staffIds: ['ada'] },
      { time: '10:00 AM', duration: '60 mins', staffIds: ['bo'] },
    ];
    expect(chooseStylist({ candidates: [ada, bo], slot, appointments: day, blocks: [], allowDoubleBookings: true })).toEqual({ ok: true, stylist: bo });
  });
});
