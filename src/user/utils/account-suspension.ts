import { UnauthorizedException } from '@nestjs/common';

export const SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact support for assistance.';

// Suspension is its own flag. It is checked wherever a session starts or is used, so a suspended
// account is stopped without touching whether its email was ever verified.
export function assertNotSuspended(user: { isSuspended?: boolean } | null | undefined): void {
  if (user?.isSuspended) throw new UnauthorizedException(SUSPENDED_MESSAGE);
}
