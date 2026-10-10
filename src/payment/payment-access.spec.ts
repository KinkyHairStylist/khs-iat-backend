import 'reflect-metadata';
import { PaymentController } from './payment.controller';
import { Role } from 'src/middleware/role.enum';

// Only customer checkout is left here: the ledger, totals, refunds and
// disputes moved to khs-iat-staff-be, so nothing that reads every payment or
// changes the ledger may remain.

const rolesOf = (handler: unknown): string[] => Reflect.getMetadata('roles', handler as object) ?? [];
const proto = PaymentController.prototype as any;

describe('the payments controller', () => {
  it('has no admin endpoints left', () => {
    for (const handler of ['paymentMethods', 'overview', 'findAll', 'findOne', 'refund', 'getDisputes', 'release']) {
      expect(proto[handler]).toBeUndefined();
    }
  });

  it('lets a customer start a payment', () => {
    expect(rolesOf(proto.createPayment)).toContain(Role.Client);
  });
});
