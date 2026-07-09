import {CanActivate, ExecutionContext, Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Role} from './role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) return false;

    // Use role fields directly from user entity (merged from UserRole)
    return requiredRoles.some((role) => {
      switch (role) {
        case Role.SuperAdmin:
          return user.isSuperAdmin;
        case Role.Admin:
          return user.isAdmin;
        case Role.Business:
          return user.isBusiness;
        case Role.Staff:
          return user.isStaff;
        case Role.Client:
          return user.isClient;
        case Role.Manager:
          return user.isManager;
        case Role.BusinessAdmin:
          return user.isBusinessAdmin;
        default:
          return false;
      }
    });
  }
}
