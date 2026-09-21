import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePaymentSettingsDto } from './DTOs/platform-settings.dto';

// Fee settings can't be saved with values that make no sense.

const check = async (input: object) => validate(plainToInstance(UpdatePaymentSettingsDto, input));

describe('payment settings limits', () => {
  it('accepts sensible fees', async () => {
    const errors = await check({ platformFee: 5, commissionRate: 12, stripePassthroughRate: 1.75, stripePassthroughFixedFee: 0.3 });
    expect(errors).toHaveLength(0);
  });

  it.each([['platformFee', 101], ['commissionRate', 150], ['stripePassthroughRate', 400], ['platformFee', -1]])(
    'refuses %s of %s',
    async (field, value) => {
      const errors = await check({ [field]: value });
      expect(errors.map((e) => e.property)).toContain(field);
    },
  );

  it('refuses a negative fixed card fee', async () => {
    const errors = await check({ stripePassthroughFixedFee: -0.5 });
    expect(errors.map((e) => e.property)).toContain('stripePassthroughFixedFee');
  });
});
