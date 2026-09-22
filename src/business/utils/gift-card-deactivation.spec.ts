import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessGiftCardStatus } from '../enum/gift-card.enum';
import {
  assertCanReactivate,
  describeActor,
  markDeactivated,
  markReactivated,
} from './gift-card-deactivation';

const now = new Date('2026-09-21T10:00:00Z');
const future = new Date('2027-01-01T00:00:00Z');
const past = new Date('2026-01-01T00:00:00Z');

const inactive = (over: object = {}) => ({
  status: BusinessGiftCardStatus.INACTIVE,
  expiresAt: future,
  deactivatedBy: 'Ada Obi',
  deactivatedByRole: 'merchant',
  deactivatedAt: now,
  ...over,
});

describe('who deactivated a gift card', () => {
  it('names the person and whether they are KHS or the salon', () => {
    expect(describeActor({ isStaff: true, firstName: 'Kemi', surname: 'Ade' })).toEqual({ name: 'Kemi Ade', role: 'admin' });
    expect(describeActor({ firstName: 'Ada', surname: 'Obi' })).toEqual({ name: 'Ada Obi', role: 'merchant' });
  });

  it('falls back to the email, then to Unknown', () => {
    expect(describeActor({ email: 'a@b.com' }).name).toBe('a@b.com');
    expect(describeActor(undefined).name).toBe('Unknown');
  });

  it('records who, their side and when, and makes the card inactive', () => {
    const card = markDeactivated({ status: BusinessGiftCardStatus.ACTIVE } as any, { name: 'Ada Obi', role: 'merchant' }, now);
    expect(card).toMatchObject({ status: 'Inactive', deactivatedBy: 'Ada Obi', deactivatedByRole: 'merchant', deactivatedAt: now });
  });
});

describe('reactivating a gift card', () => {
  it('lets a salon bring back a card it deactivated itself', () => {
    expect(() => assertCanReactivate(inactive(), 'merchant', now)).not.toThrow();
  });

  it('does not let a salon undo a KHS deactivation', () => {
    expect(() => assertCanReactivate(inactive({ deactivatedByRole: 'admin' }), 'merchant', now)).toThrow(ForbiddenException);
  });

  it('keeps cards deactivated before we recorded who did it with KHS', () => {
    expect(() => assertCanReactivate(inactive({ deactivatedByRole: null, deactivatedBy: null }), 'merchant', now)).toThrow(ForbiddenException);
  });

  it('lets KHS reactivate any deactivated card', () => {
    expect(() => assertCanReactivate(inactive({ deactivatedByRole: 'merchant' }), 'admin', now)).not.toThrow();
    expect(() => assertCanReactivate(inactive({ deactivatedByRole: null }), 'admin', now)).not.toThrow();
  });

  it.each([
    BusinessGiftCardStatus.ACTIVE,
    BusinessGiftCardStatus.USED,
    BusinessGiftCardStatus.EXPIRED,
    BusinessGiftCardStatus.DELETED,
  ])('refuses a card that is %s', (status) => {
    expect(() => assertCanReactivate(inactive({ status }), 'admin', now)).toThrow(BadRequestException);
  });

  it('refuses a card that is past its expiry date', () => {
    expect(() => assertCanReactivate(inactive({ expiresAt: past }), 'admin', now)).toThrow(/expiry date/);
  });

  it('makes the card active again and clears who deactivated it', () => {
    const card = markReactivated(inactive() as any);
    expect(card).toMatchObject({ status: 'Active', deactivatedBy: null, deactivatedByRole: null, deactivatedAt: null });
  });
});
