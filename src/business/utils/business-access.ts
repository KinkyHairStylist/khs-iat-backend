import { ForbiddenException } from '@nestjs/common';

/**
 * A platform admin can manage any business; anyone else only the business they own. Throws
 * ForbiddenException otherwise, so a merchant can't read or change another salon's records by
 * guessing an id.
 */
export function assertCanManageBusiness(
  user: { id?: string; sub?: string; isStaff?: boolean } | null | undefined,
  business: { ownerId?: string | null } | null | undefined,
): void {
  if (user?.isStaff) return;
  const userId = user?.id ?? user?.sub;
  if (!userId || !business || business.ownerId !== userId) {
    throw new ForbiddenException('You can only manage your own business');
  }
}
