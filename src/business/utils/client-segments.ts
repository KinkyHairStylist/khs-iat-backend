// A client is New for this many days from when they became the merchant's client (they booked, or the
// merchant added them), and Regular after that. Worked out from the date, never typed in.
export const NEW_CLIENT_DAYS = 30;

// Clients created on or after this moment are New.
export function newClientCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - NEW_CLIENT_DAYS * 24 * 60 * 60 * 1000);
}

export function isNewClient(createdAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!createdAt) return false;
  return new Date(createdAt).getTime() >= newClientCutoff(now).getTime();
}

export function clientSegment(createdAt: Date | string | null | undefined, now: Date = new Date()): 'New' | 'Regular' {
  return isNewClient(createdAt, now) ? 'New' : 'Regular';
}
