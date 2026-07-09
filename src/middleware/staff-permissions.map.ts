import { BusinessStaffRole } from './business-staff-role.enum';
import { Permission } from './permissions.enum';

export const STAFF_ROLE_PERMISSIONS: Record<BusinessStaffRole, Permission[]> = {
  [BusinessStaffRole.MANAGER]: [
    Permission.VIEW_BOOKINGS,
    Permission.MANAGE_BOOKINGS,
    Permission.VIEW_CLIENTS,
    Permission.MANAGE_CLIENTS,
    Permission.VIEW_STAFF,
    Permission.MANAGE_STAFF,
    Permission.VIEW_SERVICES,
    Permission.MANAGE_SERVICES,
    Permission.MANAGE_PROMOTIONS,
    Permission.VIEW_REPORTS,
    Permission.MANAGE_OWN_SCHEDULE,
    Permission.VIEW_TRANSACTIONS,
    Permission.SEND_COMMUNICATIONS,
  ],
  [BusinessStaffRole.STYLIST]: [
    Permission.VIEW_BOOKINGS,
    Permission.MANAGE_OWN_SCHEDULE,
    Permission.VIEW_CLIENTS,
    Permission.VIEW_SERVICES,
  ],
  [BusinessStaffRole.RECEPTIONIST]: [
    Permission.VIEW_BOOKINGS,
    Permission.MANAGE_BOOKINGS,
    Permission.VIEW_CLIENTS,
    Permission.MANAGE_CLIENTS,
    Permission.VIEW_SERVICES,
    Permission.VIEW_STAFF,
    Permission.SEND_COMMUNICATIONS,
  ],
  [BusinessStaffRole.CASHIER]: [
    Permission.VIEW_BOOKINGS,
    Permission.VIEW_CLIENTS,
    Permission.VIEW_SERVICES,
    Permission.VIEW_TRANSACTIONS,
    Permission.PROCESS_PAYMENT,
  ],
};
