import { BadRequestException } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import { TransactionStatus } from 'src/business/entities/transaction.entity';

// Slack posts go over the network; the tests don't need them.
jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

// KHS reviews a request, approves it, sends the money by hand and marks it paid with a reference, or
// refuses it with a reason. Each request is decided once, and the salon is told at every step.

function setup(status: string = 'Pending') {
  const withdrawal: any = {
    id: 'wd-1',
    businessId: 'biz-1',
    businessName: 'Merch Tech Salon',
    amount: 80,
    status,
    transactionId: 'txn-1',
    bankDetails: { walletId: 'wallet-1' },
  };
  const withdrawalRepo = {
    findOne: jest.fn().mockResolvedValue(withdrawal),
    save: jest.fn(async (value: any) => value),
    find: jest.fn().mockResolvedValue([]),
  };
  const transactionRepo = { update: jest.fn().mockResolvedValue({}) };
  const businessRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'biz-1',
      businessName: 'Merch Tech Salon',
      ownerId: 'owner-1',
      ownerEmail: 'owner@example.com',
      ownerName: 'Olu',
    }),
  };
  const walletService = { refundWithdrawal: jest.fn().mockResolvedValue(undefined) };
  const emailService = { sendEmail: jest.fn() };
  const templateService = { render: jest.fn().mockReturnValue('<p>hi</p>') };
  const notificationService = { create: jest.fn().mockResolvedValue({}) };

  const service = new WithdrawalService(
    withdrawalRepo as any,
    transactionRepo as any,
    businessRepo as any,
    walletService as any,
    emailService as any,
    templateService as any,
    notificationService as any,
  );
  return { service, withdrawal, transactionRepo, walletService, emailService, notificationService, withdrawalRepo };
}

describe('approving a withdrawal request', () => {
  it('moves it to Processing and tells the salon, without sending or refunding anything', async () => {
    const { service, walletService, notificationService, emailService, transactionRepo } = setup('Pending');

    const result = await service.approve('wd-1');

    expect(result.status).toBe('Processing');
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(walletService.refundWithdrawal).not.toHaveBeenCalled();
    expect(transactionRepo.update).not.toHaveBeenCalled();
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', title: 'Your withdrawal was approved' }),
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith('owner@example.com', 'Your withdrawal was approved', expect.any(String), expect.any(String));
  });

  it.each(['Processing', 'Completed', 'Rejected', 'Cancelled'])('is refused when the request is already %s', async (status) => {
    const { service, withdrawal } = setup(status);
    await expect(service.approve('wd-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(withdrawal.status).toBe(status);
  });

  it('still records the decision when the salon cannot be reached', async () => {
    const { service, notificationService } = setup('Pending');
    notificationService.create.mockRejectedValue(new Error('notifications are down'));

    const result = await service.approve('wd-1');

    expect(result.status).toBe('Processing');
  });
});

describe('marking a request as paid', () => {
  it('needs a transfer reference', async () => {
    const { service, withdrawal } = setup('Processing');

    await expect(service.markPaid('wd-1', '   ')).rejects.toThrow('Enter the transfer reference');

    expect(withdrawal.status).toBe('Processing');
  });

  it('records the reference, completes the ledger row and tells the salon with the reference', async () => {
    const { service, transactionRepo, notificationService } = setup('Processing');

    const result = await service.markPaid('wd-1', '  TRF-20260921-7781  ');

    expect(result).toMatchObject({ status: 'Completed', payoutReference: 'TRF-20260921-7781' });
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(transactionRepo.update).toHaveBeenCalledWith({ id: 'txn-1' }, { status: TransactionStatus.COMPLETED });
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your payout has been sent', message: expect.stringContaining('TRF-20260921-7781') }),
    );
  });

  it.each(['Pending', 'Completed', 'Rejected', 'Cancelled'])("can't be done for a request that is %s", async (status) => {
    const { service } = setup(status);
    await expect(service.markPaid('wd-1', 'REF')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot be done twice', async () => {
    const { service, transactionRepo } = setup('Processing');
    await service.markPaid('wd-1', 'REF-1');
    await expect(service.markPaid('wd-1', 'REF-2')).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionRepo.update).toHaveBeenCalledTimes(1);
  });
});

describe('rejecting a request', () => {
  it('needs a reason', async () => {
    const { service, walletService } = setup('Pending');

    await expect(service.reject('wd-1', '')).rejects.toThrow('Give a reason');

    expect(walletService.refundWithdrawal).not.toHaveBeenCalled();
  });

  it.each(['Pending', 'Processing'])('refunds the wallet once and tells the salon why, from %s', async (status) => {
    const { service, walletService, notificationService } = setup(status);

    const result = await service.reject('wd-1', 'The account name does not match');

    expect(walletService.refundWithdrawal).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'Rejected', rejectionReason: 'The account name does not match' });
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('The account name does not match') }),
    );
  });

  it.each(['Completed', 'Rejected', 'Cancelled'])("can't reject a request that is already %s, so the wallet is never credited twice", async (status) => {
    const { service, walletService } = setup(status);

    await expect(service.reject('wd-1', 'reason')).rejects.toBeInstanceOf(BadRequestException);

    expect(walletService.refundWithdrawal).not.toHaveBeenCalled();
  });

  it('cannot be rejected twice', async () => {
    const { service, walletService } = setup('Pending');
    await service.reject('wd-1', 'first');
    await expect(service.reject('wd-1', 'second')).rejects.toBeInstanceOf(BadRequestException);
    expect(walletService.refundWithdrawal).toHaveBeenCalledTimes(1);
  });
});

describe('what KHS still has to act on', () => {
  it('lists requests that are waiting for review or for payment', async () => {
    const { service, withdrawalRepo } = setup();
    await service.getOpen();
    expect(withdrawalRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC' } }),
    );
  });
});
