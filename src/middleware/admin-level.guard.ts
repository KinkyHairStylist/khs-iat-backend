import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_LEVEL_KEY } from './admin-level.decorator';
import { AdminRole } from './admin-role.enum';

@Injectable()
export class AdminLevelGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredLevel = this.reflector.getAllAndOverride<AdminRole>(
      ADMIN_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredLevel) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.isStaff) return false;

    if (requiredLevel === AdminRole.SUPER_ADMIN && user.adminRole !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin access required');
    }

    // AdminRole.ADMIN: both SUPER_ADMIN and ADMIN pass
    return true;
  }
}
