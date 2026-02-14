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

    if (!user || !user.role) return false;

    console.log('User Role:', user.role);

    const roleObj = user.role;

    return requiredRoles.some((role) => {
      switch (role) {
        case Role.SuperAdmin:
          return roleObj.isSuperAdmin;
        case Role.Admin:
          return roleObj.isAdmin;
        case Role.Business:
          return roleObj.isBusiness;
        case Role.Staff:
          return roleObj.isStaff;
        case Role.Client:
          return roleObj.isClient;
        case Role.Manager:
          return roleObj.isManager;
        case Role.BusinessAdmin:
          return roleObj.isBusinessAdmin;
        default:
          return false;
      }
    });
  }
}
