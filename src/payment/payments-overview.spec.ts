import { PaymentService } from './payment.service';

// The payments page counts customer payments (the Debit rows), not every ledger entry.

function setup(opts: {
  byStatus: { status: string; count: string; amount: string }[];
  oldPending: { count: string; amount: string };
  completedByMethod?: { method: string; count: string; totalAmount: string }[];
}) {
  const builder = (rawMany: any[], rawOne?: any) => {
    const chain: any = {};
    for (const step of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) {
      chain[step] = jest.fn().mockReturnValue(chain);
    }
    chain.getRawMany = jest.fn().mockResolvedValue(rawMany);
    chain.getRawOne = jest.fn().mockResolvedValue(rawOne);
    return chain;
  };

  const transactionRepo = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(builder(opts.byStatus)) // payments by status
      .mockReturnValueOnce(builder([], opts.oldPending)) // pending for more than a day
      .mockReturnValueOnce(builder(opts.completedByMethod ?? [])), // completed by method
  };

  const none: any = {};
  const service = new PaymentService(none, none, transactionRepo as any, none, none, none, none, none, none, none);
  return { service, transactionRepo };
}

describe('PaymentService.getPaymentsOverview', () => {
  const rows = [
    { status: 'completed', count: '66', amount: '7643.86' },
    { status: 'pending', count: '279', amount: '38501.93' },
    { status: 'failed', count: '1', amount: '149.99' },
  ];

  it('reports money received from completed payments only', async () => {
    const { service } = setup({ byStatus: rows, oldPending: { count: '270', amount: '37000.5' } });

    const overview = await service.getPaymentsOverview();

    expect(overview.received).toEqual({ count: 66, amount: 7643.86 });
    expect(overview.totalPayments).toBe(346);
  });

  it('splits unpaid payments into waiting and abandoned', async () => {
    const { service } = setup({ byStatus: rows, oldPending: { count: '270', amount: '37000.5' } });

    const overview = await service.getPaymentsOverview();

    expect(overview.abandoned).toEqual({ count: 270, amount: 37000.5 });
    expect(overview.waiting).toEqual({ count: 9, amount: 1501.43 });
  });

  it('counts failed and cancelled payments together', async () => {
    const { service } = setup({
      byStatus: [...rows, { status: 'cancelled', count: '2', amount: '20' }],
      oldPending: { count: '0', amount: '0' },
    });

    const overview = await service.getPaymentsOverview();

    expect(overview.failed).toEqual({ count: 3, amount: 169.99 });
  });

  it('bases the payment methods on completed payments', async () => {
    const { service } = setup({
      byStatus: rows,
      oldPending: { count: '0', amount: '0' },
      completedByMethod: [
        { method: 'Stripe', count: '60', totalAmount: '7000' },
        { method: 'Card', count: '6', totalAmount: '1000' },
      ],
    });

    const overview = await service.getPaymentsOverview();
    const stripe = overview.methods.find((m) => m.method === 'Stripe');
    const card = overview.methods.find((m) => m.method === 'Card');

    expect(stripe).toMatchObject({ amount: 7000, count: 60, percentage: 87.5 });
    expect(card).toMatchObject({ amount: 1000, percentage: 12.5 });
  });
});
