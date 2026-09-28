import { BusinessWalletService as WalletService } from './wallet.service';

// Merchants had no way to see what commission/acquisition fee was taken out
// of a booking earning — the fee Transaction rows are deliberately excluded
// from what this endpoint returns (so the ledger only shows what actually
// moved their balance), which also meant no visibility at all. This attaches
// a feeBreakdown to each earning instead, computed from its sibling fee rows.

function build(earningRows: any[], feeRows: any[]) {
  const qb: any = {};
  for (const step of ['andWhere', 'leftJoinAndSelect', 'orderBy', 'skip', 'take']) {
    qb[step] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([earningRows, earningRows.length]);

  const transactionRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    find: jest.fn().mockResolvedValue(feeRows),
  };

  const noop: any = {};
  const service = new WalletService(
    noop,
    transactionRepository as any,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  );

  return { service, transactionRepository };
}

describe('getTransactionHistory fee breakdown', () => {
  it('attaches gross/commission/acquisition to an earning that had fees taken out', async () => {
    const { service } = build(
      [{ id: 'tx-1', type: 'Earning', amount: 78, referenceId: 'BKG-1' }],
      [
        { referenceId: 'BKG-1', type: 'Fee', feeSubtype: 'Commission', amount: 12 },
        { referenceId: 'BKG-1', type: 'Fee', feeSubtype: 'Acquisition', amount: 10 },
      ],
    );

    const result = await service.getTransactionHistory('wallet-1', {} as any);

    expect(result.success).toBe(true);
    const tx = result.data!.transactionList[0] as any;
    expect(tx.feeBreakdown).toEqual({
      grossAmount: 100,
      commissionAmount: 12,
      acquisitionFeeAmount: 10,
    });
  });

  it('leaves feeBreakdown undefined for an earning with no matching fee rows', async () => {
    const { service } = build(
      [{ id: 'tx-2', type: 'Earning', amount: 50, referenceId: 'BKG-2' }],
      [],
    );

    const result = await service.getTransactionHistory('wallet-1', {} as any);

    const tx = result.data!.transactionList[0] as any;
    expect(tx.feeBreakdown).toBeUndefined();
  });

  it('never attaches a feeBreakdown to a non-earning transaction', async () => {
    const { service, transactionRepository } = build(
      [{ id: 'tx-3', type: 'Withdrawal', amount: 40, referenceId: 'BKG-3' }],
      [{ referenceId: 'BKG-3', type: 'Fee', feeSubtype: 'Commission', amount: 5 }],
    );

    const result = await service.getTransactionHistory('wallet-1', {} as any);

    // No earning rows in the page at all -> the fee lookup is skipped entirely.
    expect(transactionRepository.find).not.toHaveBeenCalled();
    const tx = result.data!.transactionList[0] as any;
    expect(tx.feeBreakdown).toBeUndefined();
  });
});
