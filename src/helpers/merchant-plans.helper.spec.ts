import {
  extendRevealWindow,
  isPlanTier,
  revealStatus,
  startRevealWindow,
  tierOrDefault,
} from './merchant-plans.helper';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-01T12:00:00.000Z');
const inDays = (n: number) => new Date(now.getTime() + n * DAY).toISOString();

describe('revealStatus', () => {
  it('is closed when disabled or with no end date', () => {
    expect(revealStatus({ enabled: false, endsAt: inDays(30) }, now).open).toBe(false);
    expect(revealStatus({ enabled: true, endsAt: null }, now).open).toBe(false);
    expect(revealStatus(null, now)).toMatchObject({ enabled: false, open: false, daysLeft: 0 });
  });

  it('counts the days left down to the shared end date', () => {
    expect(revealStatus({ enabled: true, endsAt: inDays(60) }, now).daysLeft).toBe(60);
    // Someone joining 10 days later sees 50 left, because the end date is fixed.
    const tenDaysLater = new Date(now.getTime() + 10 * DAY);
    expect(revealStatus({ enabled: true, endsAt: inDays(60) }, tenDaysLater).daysLeft).toBe(50);
  });

  it('rounds a part day up so the last day still reads 1', () => {
    const almostOver = new Date(now.getTime() + 59 * DAY + 6 * 60 * 60 * 1000);
    const status = revealStatus({ enabled: true, endsAt: inDays(60) }, almostOver);
    expect(status.daysLeft).toBe(1);
    expect(status.open).toBe(true);
  });

  it('closes at the end date and never goes negative', () => {
    const status = revealStatus({ enabled: true, endsAt: inDays(60) }, new Date(now.getTime() + 61 * DAY));
    expect(status).toMatchObject({ open: false, daysLeft: 0 });
  });

  it('is not open before its start date', () => {
    expect(
      revealStatus({ enabled: true, startsAt: inDays(5), endsAt: inDays(65) }, now).open,
    ).toBe(false);
  });

  it('ignores an unparseable date', () => {
    expect(revealStatus({ enabled: true, endsAt: 'not a date' }, now).open).toBe(false);
  });
});

describe('startRevealWindow', () => {
  it('opens a window of the given length from now', () => {
    const w = startRevealWindow(60, now);
    expect(w).toEqual({ enabled: true, startsAt: now.toISOString(), endsAt: inDays(60) });
    expect(revealStatus(w, now).daysLeft).toBe(60);
  });

  it('rejects a length that is not whole days in range', () => {
    expect(() => startRevealWindow(0, now)).toThrow(RangeError);
    expect(() => startRevealWindow(1.5, now)).toThrow(RangeError);
    expect(() => startRevealWindow(366, now)).toThrow(RangeError);
  });
});

describe('extendRevealWindow', () => {
  it('adds days to the current end date', () => {
    const w = extendRevealWindow({ enabled: true, startsAt: inDays(-10), endsAt: inDays(50) }, 15, now);
    expect(w.endsAt).toBe(inDays(65));
    expect(w.startsAt).toBe(inDays(-10));
  });

  it('never shortens the window', () => {
    const before = inDays(50);
    const w = extendRevealWindow({ enabled: true, endsAt: before }, 1, now);
    expect(new Date(w.endsAt!).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('reopens an ended window, counting the days from now', () => {
    const w = extendRevealWindow({ enabled: true, endsAt: inDays(-3) }, 10, now);
    expect(w.endsAt).toBe(inDays(10));
    expect(revealStatus(w, now).open).toBe(true);
  });

  it('can start from nothing', () => {
    const w = extendRevealWindow(null, 7, now);
    expect(w).toEqual({ enabled: true, startsAt: now.toISOString(), endsAt: inDays(7) });
  });
});

describe('tiers', () => {
  it('recognises the three plans only', () => {
    expect(isPlanTier('Pro')).toBe(true);
    expect(isPlanTier('pro')).toBe(false);
    expect(isPlanTier('Enterprise')).toBe(false);
  });

  it('falls back to Starter', () => {
    expect(tierOrDefault('Growth')).toBe('Growth');
    expect(tierOrDefault('nope')).toBe('Starter');
    expect(tierOrDefault(undefined, 'Pro')).toBe('Pro');
  });
});
