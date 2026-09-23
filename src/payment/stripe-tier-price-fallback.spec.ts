import { StripeService } from './stripe.service';

// createTierPrice reuses the tier's existing Stripe product when a stored
// priceId is given, so repeated pricing changes don't spawn a new product
// every time. The stored priceId lives in the shared database, but Stripe
// price ids are environment/account-specific -- a price created under one
// environment's STRIPE_SECRET_KEY doesn't exist under another's. Confirmed
// live: this returned "No such price" and permanently blocked any pricing
// change from that environment. Falling through to create a fresh product
// (the same thing that already happens when there's no stored price at
// all) is what makes this recoverable instead of a dead end.

function setup() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_unit_test';
  const service = new StripeService();
  const mockStripe = {
    prices: { retrieve: jest.fn(), create: jest.fn() },
    products: { create: jest.fn() },
  };
  (service as any).stripe = mockStripe;
  return { service, mockStripe };
}

describe('StripeService.createTierPrice', () => {
  it('reuses the existing product when the stored price id is found', async () => {
    const { service, mockStripe } = setup();
    mockStripe.prices.retrieve.mockResolvedValue({ product: 'prod_existing' });
    mockStripe.prices.create.mockResolvedValue({ id: 'price_new' });

    await service.createTierPrice({
      tier: 'Starter',
      amountCents: 3499,
      existingPriceId: 'price_old',
    });

    expect(mockStripe.products.create).not.toHaveBeenCalled();
    expect(mockStripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'prod_existing', unit_amount: 3499 }),
    );
  });

  it('creates a fresh product when the stored price id belongs to a different Stripe account', async () => {
    const { service, mockStripe } = setup();
    mockStripe.prices.retrieve.mockRejectedValue(new Error('No such price: price_old'));
    mockStripe.products.create.mockResolvedValue({ id: 'prod_fresh' });
    mockStripe.prices.create.mockResolvedValue({ id: 'price_new' });

    const result = await service.createTierPrice({
      tier: 'Starter',
      amountCents: 3499,
      existingPriceId: 'price_old',
    });

    expect(mockStripe.products.create).toHaveBeenCalled();
    expect(mockStripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'prod_fresh', unit_amount: 3499 }),
    );
    expect(result).toEqual({ id: 'price_new' });
  });

  it('still creates a fresh product when no existing price id was ever stored', async () => {
    const { service, mockStripe } = setup();
    mockStripe.products.create.mockResolvedValue({ id: 'prod_fresh' });
    mockStripe.prices.create.mockResolvedValue({ id: 'price_new' });

    await service.createTierPrice({ tier: 'Starter', amountCents: 3499 });

    expect(mockStripe.prices.retrieve).not.toHaveBeenCalled();
    expect(mockStripe.products.create).toHaveBeenCalled();
  });

  it('still surfaces a real failure (e.g. product/price creation itself failing)', async () => {
    const { service, mockStripe } = setup();
    mockStripe.products.create.mockRejectedValue(new Error('Stripe is down'));

    await expect(
      service.createTierPrice({ tier: 'Starter', amountCents: 3499 }),
    ).rejects.toThrow('Unable to create Stripe price: Stripe is down');
  });
});
