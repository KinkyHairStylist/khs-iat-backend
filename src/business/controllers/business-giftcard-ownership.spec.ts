import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessGiftCardsController } from './business-giftcard.controller';
import { BusinessGiftCardSoldStatus } from '../enum/gift-card.enum';

// A salon can only look at or change its own gift cards, and can't delete one a customer has bought.

function setup(card: any) {
  const giftCardsService = {
    findOne: jest.fn().mockResolvedValue(card),
    findByCode: jest.fn().mockResolvedValue(card),
    remove: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const businessRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'biz-1', ownerId: 'owner-1' }),
  };
  const controller = new BusinessGiftCardsController(giftCardsService as any, businessRepository as any);
  return { controller, giftCardsService };
}

const card = (over: object = {}) => ({
  id: 'gc-1',
  businessId: 'biz-1',
  soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
  ...over,
});
const owner = { user: { id: 'owner-1' } };
const other = { user: { id: 'owner-2' } };

describe('gift card routes that take an id', () => {
  it('shows a card to the salon that issued it', async () => {
    const { controller } = setup(card());
    await expect(controller.findOne(owner, 'gc-1')).resolves.toMatchObject({ id: 'gc-1' });
  });

  it("refuses another salon's read, update, cancel and delete", async () => {
    const { controller, giftCardsService } = setup(card());

    await expect(controller.findOne(other, 'gc-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update(other, 'gc-1', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.cancel(other, 'gc-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.remove(other, 'gc-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(giftCardsService.remove).not.toHaveBeenCalled();
    expect(giftCardsService.cancel).not.toHaveBeenCalled();
  });

  it('lets a platform admin act on any card', async () => {
    const { controller, giftCardsService } = setup(card());
    await controller.cancel({ user: { id: 'admin-1', isStaff: true } }, 'gc-1');
    expect(giftCardsService.cancel).toHaveBeenCalledWith('gc-1');
  });

  it('deletes an unsold card for its salon', async () => {
    const { controller, giftCardsService } = setup(card());
    await controller.remove(owner, 'gc-1');
    expect(giftCardsService.remove).toHaveBeenCalledWith('gc-1');
  });

  it("won't delete a card a customer has bought, even for its own salon", async () => {
    const { controller, giftCardsService } = setup(card({ soldStatus: BusinessGiftCardSoldStatus.PURCHASED }));

    await expect(controller.remove(owner, 'gc-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(giftCardsService.remove).not.toHaveBeenCalled();
  });
});
