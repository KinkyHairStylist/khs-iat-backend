import { BookingPoliciesData } from '../types/constants';

export function getBookingPoliciesConfiguration(): BookingPoliciesData[] {
  return bookingPolicies;
}

const bookingPolicies: BookingPoliciesData[] = [
  {
    title: 'Minimum lead time (minutes)',
    duration: ['1 hour', '2 hour', '3 hour', '4 hour'],
  },
  {
    title: 'Buffer time between appointments',
    duration: ['15 minutes', '30 minutes', '1 hour', '2 hour'],
  },
  {
    title: 'Cancellation window (hours)',
    duration: ['24 hours', '48 hours (2 days)'],
  },
];
