import { SetMetadata } from '@nestjs/common';
import { AdminRole } from './admin-role.enum';

export const ADMIN_LEVEL_KEY = 'admin_level';
export const AdminLevel = (level: AdminRole) =>
  SetMetadata(ADMIN_LEVEL_KEY, level);
