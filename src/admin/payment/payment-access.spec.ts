import 'reflect-metadata';
import { PaymentController } from './payment.controller';
import { Role } from 'src/middleware/role.enum';

// A customer's account passes the "client" role check, so anything that reads every payment or
// changes the ledger must be limited to admins.

const rolesOf = (handler: unknown): string[] => Reflect.getMetadata('roles', handler as object) ?? [];
const proto = PaymentController.prototype as any;

describe('who can use the admin payment endpoints', () => {
  it.each(['paymentMethods', 'overview', 'findAll', 'findOne', 'refund', 'getDisputes'])(
    '%s is for admins only',
    (handler) => {
      const roles = rolesOf(proto[handler]);
      expect(roles).toEqual(expect.arrayContaining([Role.Admin, Role.SuperAdmin]));
      expect(roles).not.toContain(Role.Client);
      expect(roles).not.toContain(Role.Customer);
    },
  );

  it('still lets a customer start a payment', () => {
    expect(rolesOf(proto.createPayment)).toContain(Role.Client);
  });
});
