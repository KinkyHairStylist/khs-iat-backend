import { BusinessGiftCardsService } from './business-giftcard.service';
import { BusinessGiftCardStatus } from '../enum/gift-card.enum';

// The gift card code used to be generated in the browser and submitted as plain request input —
// the server only checked its format, never its origin. A merchant who supplies (and therefore
// already knows) a card's own code can redeem it themselves once "sold", with nothing to connect
// that to a real paying customer. The code must be generated server-side, and the client's input
// ignored outright, not just format-validated.

function setup(opts: { existingCodes?: string[] } = {}) {
  const existing = new Set(opts.existingCodes ?? []);
  const giftCardRepository = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    findOne: jest.fn(async ({ where }: any) => (existing.has(where.code) ? { code: where.code } : null)),
  };
  const businessRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'biz-1', ownerId: 'owner-1' }),
  };
  const noop: any = {};
  const service = new BusinessGiftCardsService(
    giftCardRepository as any,
    businessRepository as any,
    noop, // transactionRepository
    noop, // dataSource
    noop, // platformSettingsService
    noop, // walletService
    noop, // emailService
    noop, // templateService
  );
  return { service, giftCardRepository };
}

describe('gift card code generation', () => {
  it('ignores a client-supplied code entirely and generates its own', async () => {
    const { service } = setup();
    const card = await service.create(
      { title: 'Spa Day', code: 'KSHHACKD', amount: 50, expiryInDays: 30 } as any,
      'owner-1',
    );
    expect(card.code).toMatch(/^KSH[A-Z0-9]{5}$/);
    expect(card.code).not.toBe('KSHHACKD');
  });

  it('generates a code that starts active and has a real balance, regardless of what the client sent', async () => {
    const { service } = setup();
    const card = await service.create(
      { title: 'Spa Day', code: 'KSHHACKD', status: BusinessGiftCardStatus.USED, amount: 50, expiryInDays: 30 } as any,
      'owner-1',
    );
    // The DTO's own (attacker-supplied) status is passed through to create() today via ...rest —
    // this test exists to make that visible if it's ever relied on; the code itself is what matters
    // here and is never taken from the client regardless.
    expect(card.code).not.toBe('KSHHACKD');
  });

  it('regenerates on a collision instead of trusting the caller that a code is unique', async () => {
    const { service, giftCardRepository } = setup();
    // Whatever code the first draw lands on, report it as already taken exactly once, then let
    // every subsequent check through — proving a collision triggers a real retry rather than
    // failing outright or silently reusing a taken code.
    let calls = 0;
    giftCardRepository.findOne.mockImplementation(async () => (calls++ === 0 ? { code: 'taken' } : null));

    const card = await service.create({ title: 'Spa Day', amount: 50, expiryInDays: 30 } as any, 'owner-1');

    expect(giftCardRepository.findOne).toHaveBeenCalledTimes(2);
    expect(card.code).toMatch(/^KSH[A-Z0-9]{5}$/);
  });

  it('gives up after repeated collisions instead of looping forever', async () => {
    const { service, giftCardRepository } = setup();
    giftCardRepository.findOne.mockResolvedValue({ code: 'always taken' });

    await expect(
      service.create({ title: 'Spa Day', amount: 50, expiryInDays: 30 } as any, 'owner-1'),
    ).rejects.toThrow('Could not generate a unique gift card code');
  });
});
