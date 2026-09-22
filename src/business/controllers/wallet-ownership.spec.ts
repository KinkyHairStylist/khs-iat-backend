import { ForbiddenException } from '@nestjs/common';
import { BusinessWalletController } from './wallet.controller';

// A merchant can only use their own wallet: not read another's payout accounts, withdrawals or
// transactions, add a payout account to it, create it, or withdraw from it.

function setup() {
  const walletService = {
    getWalletById: jest.fn().mockResolvedValue({ id: 'wallet-theirs', ownerId: 'owner-2' }),
    getWalletByBusinessId: jest.fn().mockResolvedValue({ id: 'wallet-theirs', ownerId: 'owner-2' }),
    addPaymentMethod: jest.fn().mockResolvedValue({ success: true }),
    getPaymentMethods: jest.fn().mockResolvedValue({ success: true }),
    getBusinessWithdrawals: jest.fn().mockResolvedValue({ success: true }),
    getTransactionHistory: jest.fn().mockResolvedValue({ success: true }),
    deductFunds: jest.fn().mockResolvedValue({ transaction: {}, withdrawal: {} }),
    createWalletForBusiness: jest.fn().mockResolvedValue({ success: true }),
  };
  const businessRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'biz-theirs', ownerId: 'owner-2' }),
  };
  const controller = new BusinessWalletController(walletService as any, businessRepository as any);
  return { controller, walletService, businessRepository };
}

const me = { user: { id: 'owner-1' } };

describe("using another merchant's wallet", () => {
  it('cannot read their payout accounts', async () => {
    const { controller, walletService } = setup();
    await expect(controller.getWalletPaymentMethodList(me, 'wallet-theirs')).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletService.getPaymentMethods).not.toHaveBeenCalled();
  });

  it('cannot read their withdrawals or transactions', async () => {
    const { controller, walletService } = setup();
    await expect(controller.getWithdrawalsList(me, 'biz-theirs')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getTransactionHistory(me, 'wallet-theirs', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletService.getBusinessWithdrawals).not.toHaveBeenCalled();
    expect(walletService.getTransactionHistory).not.toHaveBeenCalled();
  });

  it('cannot add a payout account to it', async () => {
    const { controller, walletService } = setup();
    await expect(controller.addPaymentMethod(me, { walletId: 'wallet-theirs' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletService.addPaymentMethod).not.toHaveBeenCalled();
  });

  it('cannot withdraw from it', async () => {
    const { controller, walletService } = setup();
    await expect(
      controller.debitWallet(me, { transaction: { businessId: 'biz-theirs', amount: 50 }, withdrawal: {} } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletService.deductFunds).not.toHaveBeenCalled();
  });

  it('cannot create a wallet for a business it does not own', async () => {
    const { controller, walletService } = setup();
    await expect(
      controller.createWallet(me, { businessId: 'biz-theirs', ownerId: 'owner-1' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletService.createWalletForBusiness).not.toHaveBeenCalled();
  });
});

describe('using your own wallet', () => {
  it('still works', async () => {
    const { controller, walletService } = setup();
    walletService.getWalletById.mockResolvedValue({ id: 'wallet-mine', ownerId: 'owner-1' });
    walletService.getWalletByBusinessId.mockResolvedValue({ id: 'wallet-mine', ownerId: 'owner-1' });

    await controller.getWalletPaymentMethodList(me, 'wallet-mine');
    await controller.getWithdrawalsList(me, 'biz-mine');
    await controller.debitWallet(me, { transaction: { businessId: 'biz-mine', amount: 10 }, withdrawal: {} } as any);

    expect(walletService.getPaymentMethods).toHaveBeenCalled();
    expect(walletService.getBusinessWithdrawals).toHaveBeenCalled();
    expect(walletService.deductFunds).toHaveBeenCalled();
  });

  it("creates a wallet owned by the business's owner, whatever the request says", async () => {
    const { controller, walletService, businessRepository } = setup();
    businessRepository.findOne.mockResolvedValue({ id: 'biz-mine', ownerId: 'owner-1' });

    await controller.createWallet(me, { businessId: 'biz-mine', ownerId: 'someone-else' } as any);

    expect(walletService.createWalletForBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-mine', ownerId: 'owner-1' }),
    );
  });

  it('lets a platform admin use any wallet', async () => {
    const { controller, walletService } = setup();
    await controller.getWalletPaymentMethodList({ user: { id: 'admin-1', isStaff: true } }, 'wallet-theirs');
    expect(walletService.getPaymentMethods).toHaveBeenCalled();
  });
});
