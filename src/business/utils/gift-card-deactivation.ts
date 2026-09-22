import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessGiftCardStatus } from '../enum/gift-card.enum';

export type DeactivatorRole = 'admin' | 'merchant';

export interface DeactivationFields {
  status?: BusinessGiftCardStatus | string;
  expiresAt?: Date | string | null;
  deactivatedBy?: string | null;
  deactivatedByRole?: DeactivatorRole | string | null;
  deactivatedAt?: Date | null;
}

export interface Actor {
  name: string;
  role: DeactivatorRole;
}

// Who is acting, in words a person can read on the card, and which side of the platform they are on.
export function describeActor(user: {
  isStaff?: boolean;
  firstName?: string;
  surname?: string;
  email?: string;
} | null | undefined): Actor {
  const name = [user?.firstName, user?.surname].filter(Boolean).join(' ').trim() || user?.email || 'Unknown';
  return { name, role: user?.isStaff ? 'admin' : 'merchant' };
}

export function markDeactivated<T extends DeactivationFields>(card: T, actor: Actor | undefined, now = new Date()): T {
  card.status = BusinessGiftCardStatus.INACTIVE;
  card.deactivatedBy = actor?.name ?? null;
  card.deactivatedByRole = actor?.role ?? null;
  card.deactivatedAt = now;
  return card;
}

// A salon can bring back only what it deactivated itself. A card KHS deactivated (or one deactivated
// before we recorded who did it) stays with KHS, because it may have been stopped for a reason the
// salon can't see, such as a fraud check.
export function assertCanReactivate(card: DeactivationFields, role: DeactivatorRole, now = new Date()): void {
  if (card.status !== BusinessGiftCardStatus.INACTIVE) {
    throw new BadRequestException('Only a deactivated gift card can be reactivated.');
  }
  if (role === 'merchant' && card.deactivatedByRole !== 'merchant') {
    throw new ForbiddenException(
      card.deactivatedByRole === 'admin'
        ? 'KHS deactivated this gift card. Contact KHS if it should be reactivated.'
        : 'This gift card was deactivated before we recorded who did it. Contact KHS to reactivate it.',
    );
  }
  if (card.expiresAt && new Date(card.expiresAt) < now) {
    throw new BadRequestException('This gift card has passed its expiry date, so it cannot be reactivated.');
  }
}

export function markReactivated<T extends DeactivationFields>(card: T): T {
  card.status = BusinessGiftCardStatus.ACTIVE;
  card.deactivatedBy = null;
  card.deactivatedByRole = null;
  card.deactivatedAt = null;
  return card;
}
