import {
  formatMoney,
  formatMoneyExact,
  percentChange,
  shareOfLeader,
  shareSlices,
  statusColor,
  statusLabel,
} from './dashboard-stats.helper';

describe('dashboard stats helpers', () => {
  describe('percentChange', () => {
    it('shows growth and decline', () => {
      expect(percentChange(150, 100)).toEqual({ text: '+50.0%', type: 'increase' });
      expect(percentChange(90, 100)).toEqual({ text: '-10.0%', type: 'decrease' });
    });

    it("doesn't invent a percentage when there is nothing to compare with", () => {
      expect(percentChange(5, 0)).toEqual({ text: 'New', type: 'increase' });
      expect(percentChange(0, 0)).toEqual({ text: '0%', type: 'neutral' });
    });

    it('treats an unchanged figure as neutral', () => {
      expect(percentChange(100, 100)).toEqual({ text: '0%', type: 'neutral' });
    });
  });

  describe('money', () => {
    it('shortens thousands and keeps cents below that', () => {
      expect(formatMoney(124000)).toBe('$124.0K');
      expect(formatMoney(12.5)).toBe('$12.50');
    });

    it('formats exact amounts for lists', () => {
      expect(formatMoneyExact(6250)).toBe('$6,250');
      expect(formatMoneyExact(1234.5)).toBe('$1,234.5');
    });
  });

  describe('shareSlices', () => {
    it('always adds up to 100 and folds the tail into Other', () => {
      const slices = shareSlices(
        [
          { name: 'Hair', count: 40 },
          { name: 'Nails', count: 30 },
          { name: 'Spa', count: 20 },
          { name: 'Makeup', count: 6 },
          { name: 'Lashes', count: 4 },
        ],
        4,
      );
      expect(slices.map((s) => s.name)).toEqual(['Hair', 'Nails', 'Spa', 'Other']);
      expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(100);
      expect(slices[3].value).toBe(10);
    });

    it('rounds awkward splits without drifting off 100', () => {
      const slices = shareSlices([
        { name: 'A', count: 1 },
        { name: 'B', count: 1 },
        { name: 'C', count: 1 },
      ]);
      expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(100);
    });

    it('merges groups with the same name so "Other" never appears twice', () => {
      const slices = shareSlices(
        [
          { name: 'Hair', count: 50 },
          { name: 'Other', count: 10 },
          { name: 'Nails', count: 20 },
          { name: 'Spa', count: 10 },
          { name: 'Makeup', count: 10 },
        ],
        4,
      );
      const others = slices.filter((s) => s.name === 'Other');
      expect(others).toHaveLength(1);
      expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(100);
    });

    it('returns nothing when there are no bookings, rather than made-up shares', () => {
      expect(shareSlices([])).toEqual([]);
      expect(shareSlices([{ name: 'A', count: 0 }])).toEqual([]);
    });
  });

  describe('shareOfLeader', () => {
    it('makes the best performer 100%', () => {
      expect(shareOfLeader([200, 100, 50])).toEqual([100, 50, 25]);
    });
    it('handles no revenue', () => {
      expect(shareOfLeader([0, 0])).toEqual([0, 0]);
    });
  });

  describe('status helpers', () => {
    it('labels and colours statuses', () => {
      expect(statusLabel('under_review')).toBe('Under review');
      expect(statusColor('Pending')).toContain('amber');
      expect(statusColor('approved')).toContain('green');
      expect(statusColor('weird')).toContain('gray');
    });
  });
});
