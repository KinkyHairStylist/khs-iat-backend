import { NEW_CLIENT_DAYS, clientSegment, isNewClient, newClientCutoff } from './client-segments';

const NOW = new Date('2026-09-21T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('New and Regular clients', () => {
  it('treats a client as New for 30 days', () => {
    expect(NEW_CLIENT_DAYS).toBe(30);
    expect(clientSegment(daysAgo(0), NOW)).toBe('New');
    expect(clientSegment(daysAgo(29), NOW)).toBe('New');
  });

  it('makes them Regular after that', () => {
    expect(clientSegment(daysAgo(31), NOW)).toBe('Regular');
    expect(clientSegment(daysAgo(400), NOW)).toBe('Regular');
  });

  it('counts the 30th day as still New, and the moment after as Regular', () => {
    expect(isNewClient(newClientCutoff(NOW), NOW)).toBe(true);
    expect(isNewClient(new Date(newClientCutoff(NOW).getTime() - 1), NOW)).toBe(false);
  });

  it('reads dates that arrive as text', () => {
    expect(clientSegment(daysAgo(2).toISOString(), NOW)).toBe('New');
    expect(clientSegment(daysAgo(90).toISOString(), NOW)).toBe('Regular');
  });

  it('has no opinion of a client with no date, so they are Regular', () => {
    expect(clientSegment(null, NOW)).toBe('Regular');
    expect(clientSegment(undefined, NOW)).toBe('Regular');
  });
});
