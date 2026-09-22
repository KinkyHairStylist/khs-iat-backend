import { BusinessGiftCardsController } from './business-giftcard.controller';
import { BusinessGiftCardSoldStatus } from '../enum/gift-card.enum';

// A gift card's code redeems it. A merchant creating/listing/viewing/updating their own cards has
// no legitimate reason to see it — it goes to the recipient by email — since a merchant who can see
// a code they created can redeem it themselves with no real paying customer involved. Every
// merchant-facing response should have it stripped; the merchant's own request (findByCode, redeem)
// still needs the raw code, since they typed it in themselves.

const cardWithCode = (over: object = {}) => ({
  id: 'gc-1',
  businessId: 'biz-1',
  code: 'KSH7Q2XM',
  soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
  amount: 100,
  ...over,
});

function setup() {
  const giftCardsService = {
    create: jest.fn().mockResolvedValue(cardWithCode()),
    findOne: jest.fn().mockResolvedValue(cardWithCode()),
    getGiftCardsList: jest.fn().mockResolvedValue({
      giftCards: [cardWithCode({ id: 'gc-1' }), cardWithCode({ id: 'gc-2', code: 'KSH9F4LP' })],
      meta: { total: 2, page: 1, limit: 6, totalPages: 1, startIndex: 1, endIndex: 2 },
    }),
    update: jest.fn().mockResolvedValue(cardWithCode()),
    markAsSent: jest.fn().mockResolvedValue(cardWithCode()),
    markAsExpired: jest.fn().mockResolvedValue(cardWithCode()),
  };
  const businessRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'biz-1', ownerId: 'owner-1' }),
  };
  const controller = new BusinessGiftCardsController(giftCardsService as any, businessRepository as any);
  const req = { user: { id: 'owner-1' } };
  return { controller, req };
}

describe('a merchant never sees a gift card\'s own code', () => {
  it('is stripped from the response right after creating a card', async () => {
    const { controller, req } = setup();
    const result = await controller.create(req, { title: 'Spa Day' } as any);
    expect(result.data).not.toHaveProperty('code');
  });

  it('is stripped from every card in the list', async () => {
    const { controller, req } = setup();
    const result = await controller.getBusinessGiftCardsList(req, {} as any);
    for (const card of result.data.giftCards) {
      expect(card).not.toHaveProperty('code');
    }
  });

  it('is stripped when fetching a single card by id', async () => {
    const { controller, req } = setup();
    const result = await controller.findOne(req, 'gc-1');
    expect(result).not.toHaveProperty('code');
  });

  it('is stripped after updating a card', async () => {
    const { controller, req } = setup();
    const result = await controller.update(req, 'gc-1', {} as any);
    expect(result.data).not.toHaveProperty('code');
  });
});
