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

    return requiredRoles.some((role) => {
      switch (role) {
        case Role.Staff:
          return user.isStaff;
        case Role.Merchant:
          return user.isMerchant;
        case Role.Customer:
          return user.isCustomer;
        case Role.BusinessStaff:
          return user.isBusinessStaff;
        default:
          return false;
      }
    });
  }
}
