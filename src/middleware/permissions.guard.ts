import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { Permission } from './permissions.enum';
import { STAFF_ROLE_PERMISSIONS } from './staff-permissions.map';
import { BusinessStaffRole } from './business-staff-role.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Merchants and platform staff bypass permission checks — they have full access
    if (user.isMerchant || user.isStaff) return true;

    if (!user.isBusinessStaff || !user.businessStaffRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const staffRole = user.businessStaffRole as BusinessStaffRole;
    const allowedPermissions = STAFF_ROLE_PERMISSIONS[staffRole] ?? [];

    if (!allowedPermissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Role '${staffRole}' does not have permission: ${requiredPermission}`,
      );
    }

    return true;
  }
}
