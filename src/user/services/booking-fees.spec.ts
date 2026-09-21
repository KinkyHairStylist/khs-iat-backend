import { merchantNetAfterFees, merchantPayout } from './booking-fees';

describe('merchantNetAfterFees', () => {
  it('takes the commission out of what the merchant is paid', () => {
    expect(merchantNetAfterFees(35, 0, 4.2)).toBe(30.8);
  });

  it('takes the acquisition fee out too on a first booking', () => {
    expect(merchantNetAfterFees(100, 5, 12)).toBe(83);
  });

  it('accepts amounts that arrive as decimal strings', () => {
    expect(merchantNetAfterFees('35.00' as any, '0.00' as any, '4.20' as any)).toBe(30.8);
  });

  it('never pays a negative amount', () => {
    expect(merchantNetAfterFees(5, 2, 12)).toBe(0);
  });

  it('rounds to cents', () => {
    expect(merchantNetAfterFees(10.005, 0, 0.333)).toBe(9.67);
  });
});

describe('merchantPayout', () => {
  it('credits what is left after the fees, with nothing owed', () => {
    expect(merchantPayout(35, 0, 4.2)).toEqual({ credit: 30.8, shortfall: 0 });
  });

  it('reports what is still owed when the fees are more than the payment', () => {
    expect(merchantPayout(2, 3.5, 1.8)).toEqual({ credit: 0, shortfall: 3.3 });
  });
});
