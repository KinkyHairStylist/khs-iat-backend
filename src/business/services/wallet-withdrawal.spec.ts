import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BusinessWalletService } from './wallet.service';
import { Wallet } from '../entities/wallet.entity';
import { WalletPaymentMethod } from '../entities/payment-method.entity';
import { Business } from '../entities/business.entity';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { Withdrawal } from 'src/admin/withdrawal/entities/withdrawal.entity';

// Slack posts go over the network; the tests don't need them.
jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

// A salon asks KHS to pay out part of its balance. The money comes off the balance at once, only
// valid requests get through, and a refused or cancelled request puts the money back.

function setup(over: { balance?: number; walletStatus?: string; methodBelongsToWallet?: boolean } = {}) {
  const wallet: any = {
    id: 'wallet-1',
    businessId: 'biz-1',
    ownerId: 'owner-1',
    balance: over.balance ?? 100,
    totalExpenses: 0,
    currency: 'USD',
    status: over.walletStatus ?? 'active',
  };
  const bank: any = { id: 'pm-1', walletId: 'wallet-1', isActive: true };
  const business: any = { id: 'biz-1', businessName: 'Merch Tech Salon' };

  let nextId = 1;
  const saved: Record<string, any[]> = { Transaction: [], Withdrawal: [], Wallet: [] };
  const manager: any = {
    findOne: jest.fn(async (entity: any, options: any) => {
      if (entity === Wallet) return wallet;
      if (entity === WalletPaymentMethod) {
        const belongs = over.methodBelongsToWallet !== false;
        return belongs && options.where.id === 'pm-1' && options.where.walletId === 'wallet-1' ? bank : null;
      }
      if (entity === Business) return business;
      return null;
    }),
    create: jest.fn((_entity: any, value: any) => ({ ...value })),
    save: jest.fn(async (entity: any, value: any) => {
      if (entity === Transaction || entity === Withdrawal) {
        if (!value.id) value.id = `abcdef0${nextId++}-0000-0000-0000-000000000000`;
        saved[entity.name].push(value);
      }
      return value;
    }),
    update: jest.fn().mockResolvedValue({}),
  };

  const walletRepository: any = {
    manager: { transaction: (callback: any) => callback(manager) },
    findOne: jest.fn().mockResolvedValue(wallet),
  };
  const withdrawalRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(async (value: any) => value),
  };

  const service = new BusinessWalletService(
    walletRepository,
    {} as any,
    {} as any,
    withdrawalRepository,
    {} as any,
  );
  return { service, wallet, manager, saved, withdrawalRepository, walletRepository };
}

const request = (amount: number, bankDetailsId = 'pm-1') => ({
  businessId: 'biz-1',
  amount,
  bankDetailsId,
});

describe('requesting a withdrawal', () => {
  it('takes the amount off the balance and creates a pending request', async () => {
    const { service, wallet, saved } = setup({ balance: 100 });

    const { transaction, withdrawal } = await service.requestWithdrawal(request(40));

    expect(wallet.balance).toBe(60);
    expect(wallet.totalExpenses).toBe(40);
    expect(transaction).toMatchObject({ type: TransactionType.WITHDRAWAL, status: TransactionStatus.PENDING, amount: 40 });
    expect(withdrawal).toMatchObject({ status: 'Pending', amount: 40, currentBalance: 60, businessId: 'biz-1' });
    expect(withdrawal.transactionId).toBe(transaction.id);
    expect(transaction.referenceId).toMatch(/^WD-[0-9A-Z]{8}$/);
    expect(saved.Withdrawal).toHaveLength(1);
  });

  it.each([[0], [-50], [NaN], [Infinity]])('refuses an amount of %s, so nobody can add money by withdrawing a negative amount', async (amount) => {
    const { service, wallet, manager } = setup({ balance: 100 });

    await expect(service.requestWithdrawal(request(amount))).rejects.toBeInstanceOf(BadRequestException);

    expect(wallet.balance).toBe(100);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuses more than the available balance and changes nothing', async () => {
    const { service, wallet, manager } = setup({ balance: 30 });

    await expect(service.requestWithdrawal(request(30.01))).rejects.toThrow('Insufficient wallet balance');

    expect(wallet.balance).toBe(30);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("refuses a payout account that isn't this wallet's, before any money moves", async () => {
    const { service, wallet, manager } = setup({ balance: 100, methodBelongsToWallet: false });

    await expect(service.requestWithdrawal(request(10))).rejects.toBeInstanceOf(NotFoundException);

    expect(wallet.balance).toBe(100);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuses a wallet that is not active', async () => {
    const { service, wallet } = setup({ balance: 100, walletStatus: 'suspended' });
    await expect(service.requestWithdrawal(request(10))).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.balance).toBe(100);
  });

  it('rounds to cents', async () => {
    const { service, wallet } = setup({ balance: 100 });
    await service.requestWithdrawal(request(10.005));
    expect(wallet.balance).toBeCloseTo(89.99, 2);
  });
});

describe('the withdrawal request from the salon page (deductFunds)', () => {
  it('uses the wallet and payout account from the server, whatever else the request says', async () => {
    const { service, wallet } = setup({ balance: 100 });

    const result = await service.deductFunds({
      transaction: { type: TransactionType.WITHDRAWAL, businessId: 'biz-1', amount: 25, currency: 'EUR', senderId: 'attacker' } as any,
      withdrawal: { bankDetailsId: 'pm-1' },
    } as any);

    expect(wallet.balance).toBe(75);
    expect(result.transaction.currency).toBe('USD');
    expect(result.transaction.senderId).toBe('owner-1');
  });

  it('refuses a negative amount here too', async () => {
    const { service, wallet } = setup({ balance: 100 });

    await expect(
      service.deductFunds({
        transaction: { type: TransactionType.WITHDRAWAL, businessId: 'biz-1', amount: -1000 } as any,
        withdrawal: { bankDetailsId: 'pm-1' },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.balance).toBe(100);
  });
});

describe('putting a withdrawal back', () => {
  const pendingWithdrawal = (over: object = {}): any => ({
    id: 'wd-1',
    businessId: 'biz-1',
    amount: 40,
    status: 'Pending',
    transactionId: 'txn-1',
    bankDetails: { walletId: 'wallet-1' },
    ...over,
  });

  it('gives the amount back to the wallet and cancels the ledger row', async () => {
    const { service, wallet, manager } = setup({ balance: 60 });
    wallet.totalExpenses = 40;

    await service.refundWithdrawal(pendingWithdrawal());

    expect(wallet.balance).toBe(100);
    expect(wallet.totalExpenses).toBe(0);
    expect(manager.update).toHaveBeenCalledWith(Transaction, { id: 'txn-1' }, { status: TransactionStatus.CANCELLED });
  });

  it('lets the salon cancel its own pending request', async () => {
    const { service, wallet, withdrawalRepository } = setup({ balance: 60 });
    withdrawalRepository.findOne.mockResolvedValue(pendingWithdrawal());

    const result = await service.cancelWithdrawal('wd-1', { id: 'owner-1' });

    expect(result.status).toBe('Cancelled');
    expect(wallet.balance).toBe(100);
  });

  it("won't let another salon cancel it", async () => {
    const { service, wallet, withdrawalRepository } = setup({ balance: 60 });
    withdrawalRepository.findOne.mockResolvedValue(pendingWithdrawal());

    await expect(service.cancelWithdrawal('wd-1', { id: 'someone-else' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(wallet.balance).toBe(60);
  });

  it.each(['Processing', 'Completed', 'Rejected', 'Cancelled'])('won\'t cancel a request that is already %s', async (status) => {
    const { service, wallet, withdrawalRepository } = setup({ balance: 60 });
    withdrawalRepository.findOne.mockResolvedValue(pendingWithdrawal({ status }));

    await expect(service.cancelWithdrawal('wd-1', { id: 'owner-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.balance).toBe(60);
  });
});
