import { WalletService } from './wallet.service';

// The wallet summary reports what the business wallets hold, not a figure worked out from the ledger.

function chain(rawOne: any) {
  const c: any = {};
  for (const step of ['select', 'addSelect', 'where', 'andWhere', 'from']) {
    c[step] = jest.fn().mockReturnValue(c);
  }
  c.getRawOne = jest.fn().mockResolvedValue(rawOne);
  return c;
}

function setup(opts: { today: string; yesterday: string }) {
  const transactionRepo: any = {
    // In the order getDashboardSummary asks: pending withdrawals, today, yesterday, fees, payments.
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(chain({ totalPending: '95', requests: '3' }))
      .mockReturnValueOnce(chain({ todayTotal: opts.today }))
      .mockReturnValueOnce(chain({ yesterdayTotal: opts.yesterday }))
      .mockReturnValueOnce(chain({ totalFees: '30' }))
      .mockReturnValueOnce(chain({ volume: '600' })),
    manager: { createQueryBuilder: jest.fn().mockReturnValue(chain({ available: '503.6', held: '20' })) },
  };
  return new WalletService(transactionRepo);
}

describe('WalletService.getDashboardSummary', () => {
  it('reports the balance the business wallets hold, available plus held', async () => {
    const summary = await setup({ today: '50', yesterday: '25' }).getDashboardSummary();

    expect(summary.totalWalletBalance).toMatchObject({ amount: '523.60', available: '503.60', held: '20.00' });
  });

  it('works out the average fee rate against what customers paid', async () => {
    const summary = await setup({ today: '50', yesterday: '25' }).getDashboardSummary();

    expect(summary.platformFees).toEqual({ amount: '30.00', avgRate: '5.0' });
  });

  it('shows growth against yesterday only when something was earned yesterday', async () => {
    const growing = await setup({ today: '50', yesterday: '25' }).getDashboardSummary();
    const noBaseline = await setup({ today: '50', yesterday: '0' }).getDashboardSummary();

    expect(growing.todaysEarnings.growthPercent).toBe('100.0');
    expect(noBaseline.todaysEarnings.growthPercent).toBeNull();
  });
});
