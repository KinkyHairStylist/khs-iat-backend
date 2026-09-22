import {
  checkBookingAgainstRules,
  parseClockToMinutes,
  parseDurationToMinutes,
  ResolvedBookingRules,
  resolveBookingRules,
  wallClockMs,
} from './booking-rules.helper';

const rules = (over: Partial<ResolvedBookingRules> = {}): ResolvedBookingRules => ({
  minimumLeadMinutes: 60,
  bufferMinutes: 0,
  maximumAdvanceDays: 90,
  sameDayCutoffMinutes: null,
  allowDoubleBookings: false,
  ...over,
});

// "Now" is Thursday 2026-09-24 at 10:00 wall-clock.
const NOW = wallClockMs('2026-09-24', '10:00')!;

const check = (over: Partial<Parameters<typeof checkBookingAgainstRules>[0]> & { r?: Partial<ResolvedBookingRules> }) =>
  checkBookingAgainstRules({
    rules: rules(over.r),
    date: '2026-09-24',
    time: '2:00 PM',
    durationMinutes: 60,
    nowWallClockMs: NOW,
    ...over,
  });

describe('booking rules', () => {
  it('parses clock strings and durations', () => {
    expect(parseClockToMinutes('15:00')).toBe(900);
    expect(parseClockToMinutes('3:00 PM')).toBe(900);
    expect(parseClockToMinutes('12:15 am')).toBe(15);
    expect(parseClockToMinutes('nope')).toBeNull();
    expect(parseDurationToMinutes('1 hr 30 mins')).toBe(90);
    expect(parseDurationToMinutes('45 min')).toBe(45);
    expect(parseDurationToMinutes(undefined)).toBe(30);
  });

  it('allows a booking that satisfies every rule', () => {
    expect(check({})).toBeNull();
  });

  it('enforces the minimum lead time', () => {
    expect(check({ time: '10:30 AM' })).toMatch(/at least 1 hour notice/);
    expect(check({ time: '11:00 AM' })).toBeNull();
    expect(check({ r: { minimumLeadMinutes: 30 }, time: '10:30 AM' })).toBeNull();
    expect(check({ r: { minimumLeadMinutes: 24 * 60 }, date: '2026-09-25', time: '9:00 AM' })).toMatch(/1 day notice/);
  });

  it('enforces the maximum advance window', () => {
    expect(check({ r: { maximumAdvanceDays: 7 }, date: '2026-10-01' })).toBeNull();
    expect(check({ r: { maximumAdvanceDays: 7 }, date: '2026-10-02' })).toMatch(/up to 7 days ahead/);
  });

  it('closes same-day bookings after the cutoff, but only for today', () => {
    const late = wallClockMs('2026-09-24', '3:30 PM')!;
    expect(
      check({ r: { minimumLeadMinutes: 0, sameDayCutoffMinutes: 900 }, nowWallClockMs: late, time: '6:00 PM' }),
    ).toMatch(/close at 3:00 PM/);
    expect(
      check({ r: { minimumLeadMinutes: 0, sameDayCutoffMinutes: 900 }, nowWallClockMs: late, date: '2026-09-25', time: '6:00 PM' }),
    ).toBeNull();
    expect(
      check({ r: { minimumLeadMinutes: 0, sameDayCutoffMinutes: 900 }, time: '6:00 PM' }),
    ).toBeNull();
  });

  it('blocks overlapping bookings when double bookings are off', () => {
    const existing = [{ date: '2026-09-24', time: '2:00 PM', duration: '1 hr' }];
    expect(check({ existing })).toMatch(/no longer available/);
    expect(check({ existing, time: '2:30 PM' })).toMatch(/no longer available/);
    expect(check({ existing, time: '3:00 PM' })).toBeNull();
    expect(check({ existing, time: '1:00 PM' })).toBeNull();
    expect(check({ existing: [{ ...existing[0], date: '2026-09-25' }] })).toBeNull();
  });

  it('adds the buffer on both sides of an existing booking', () => {
    const existing = [{ date: '2026-09-24', time: '2:00 PM', duration: '1 hr' }];
    const r = { bufferMinutes: 15 };
    expect(check({ r, existing, time: '3:00 PM' })).toMatch(/no longer available/);
    expect(check({ r, existing, time: '3:15 PM' })).toBeNull();
    expect(check({ r, existing, time: '1:00 PM' })).toMatch(/no longer available/);
    expect(check({ r, existing, time: '12:45 PM' })).toBeNull();
  });

  it('skips the overlap check when double bookings are allowed', () => {
    const existing = [{ date: '2026-09-24', time: '2:00 PM', duration: '1 hr' }];
    expect(check({ r: { allowDoubleBookings: true }, existing })).toBeNull();
  });

  it('resolves rules preferring booking policies, then dashboard values, then defaults', () => {
    expect(resolveBookingRules(null)).toEqual({
      minimumLeadMinutes: 1440,
      bufferMinutes: 0,
      maximumAdvanceDays: 90,
      sameDayCutoffMinutes: null,
      allowDoubleBookings: false,
    });
    const business: any = {
      bookingPolicies: { minimumLeadTime: 30, bufferTime: 15 },
      ownerSettings: {
        bookingRules: {
          minimumLeadTimeHours: 24,
          bufferTimeBetweenAppointmentsMinutes: 0,
          maximumAdvanceBookingDays: 60,
          sameDayBookingCutoff: '15:00',
          allowDoubleBookings: true,
        },
      },
    };
    expect(resolveBookingRules(business)).toEqual({
      minimumLeadMinutes: 30,
      bufferMinutes: 15,
      maximumAdvanceDays: 60,
      sameDayCutoffMinutes: 900,
      allowDoubleBookings: true,
    });
    expect(
      resolveBookingRules({ bookingPolicies: undefined, ownerSettings: business.ownerSettings } as any).minimumLeadMinutes,
    ).toBe(1440);
  });
});
