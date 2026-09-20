import { Business } from 'src/business/entities/business.entity';

export const DEFAULT_CANCELLATION_WINDOW_HOURS = 24;

// The merchant's cancellation window in hours. The sign-up wizard stores it on
// booking_policies and Settings > Booking Rules keeps it in sync on save, so
// that copy wins; the dashboard value is the fallback for salons with no
// booking_policies row.
export function resolveCancellationWindowHours(
  business?: Pick<Business, 'bookingPolicies' | 'ownerSettings'> | null,
): number {
  return (
    business?.bookingPolicies?.cancellationWindow ??
    business?.ownerSettings?.pricingPolicies?.cancellationWindow ??
    DEFAULT_CANCELLATION_WINDOW_HOURS
  );
}
