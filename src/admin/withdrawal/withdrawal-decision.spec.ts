import { BadRequestException } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';

// Slack posts go over the network; the tests don't need them.
jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

// A withdrawal request can be decided once. Deciding it again must not touch the wallet.

function setup(status: 'Pending' | 'Processing' | 'Completed' | 'Rejected') {
  const withdrawal: any = {
    id: 'w-1',
    businessId: 'biz-1',
    businessName: 'Merch Tech Salon',
    amount: 80,
    status,
    bankDetails: { walletId: 'wallet-1' },
  };
  const wallet: any = { id: 'wallet-1', balance: 100, currency: 'USD' };

  const withdrawalRepo = {
    findOne: jest.fn().mockResolvedValue(withdrawal),
    save: jest.fn(async (value: any) => value),
  };
  const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet), save: jest.fn(async (value: any) => value) };
  const transactionRepo = { save: jest.fn() };
  const businessRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const service = new WithdrawalService(
    withdrawalRepo as any,
    walletRepo as any,
    transactionRepo as any,
    {} as any,
    businessRepo as any,
    { sendEmail: jest.fn() } as any,
    {} as any,
  );
  return { service, withdrawal, wallet, walletRepo, transactionRepo, withdrawalRepo };
}

describe('deciding a withdrawal request', () => {
  it('rejects a pending request and credits the wallet once', async () => {
    const { service, wallet, transactionRepo } = setup('Pending');

    const result = await service.reject('w-1');

    expect(result.status).toBe('Rejected');
    expect(wallet.balance).toBe(180);
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
  });

  it.each(['Rejected', 'Completed', 'Processing'] as const)(
    'refuses to reject a request that is already %s, so the wallet is not credited again',
    async (status) => {
      const { service, wallet, walletRepo } = setup(status);

      await expect(service.reject('w-1')).rejects.toBeInstanceOf(BadRequestException);

      expect(wallet.balance).toBe(100);
      expect(walletRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['Rejected', 'Completed', 'Processing'] as const)(
    'refuses to approve a request that is already %s',
    async (status) => {
      const { service, withdrawalRepo } = setup(status);

      await expect(service.approve('w-1')).rejects.toBeInstanceOf(BadRequestException);

      expect(withdrawalRepo.save).not.toHaveBeenCalled();
    },
  );

  it('finds the business wallet when the payout account has been removed', async () => {
    const { service, withdrawal, wallet, walletRepo } = setup('Pending');
    withdrawal.bankDetails = null;

    await service.reject('w-1');

    expect(walletRepo.findOne).toHaveBeenCalledWith({ where: { businessId: 'biz-1' } });
    expect(wallet.balance).toBe(180);
  });
});
