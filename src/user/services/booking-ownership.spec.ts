import { NotFoundException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { UserController } from '../controllers/user.controller';

// A customer can only read, cancel, restore or reschedule their own booking, and a booking never
// carries anyone's password or reset codes.

function setup() {
  const appointment: any = {
    id: 'a1',
    orderId: 'BKID-1',
    client: { id: 'cust-1', password: 'hash-1', resetCode: '123456', firstName: 'Cee' },
    business: { id: 'biz-1', owner: { id: 'owner-1', password: 'hash-2', resetCode: '654321', verificationCode: '111', firstName: 'Olu' } },
  };
  const bookingRepository = { find: jest.fn().mockResolvedValue([appointment]), findOne: jest.fn().mockResolvedValue(appointment) };
  const noop: any = {};
  const service = new BookingService(
    bookingRepository as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    { getReviewedOrderIds: jest.fn().mockResolvedValue(new Set()) } as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service, bookingRepository };
}

const me: any = { id: 'cust-1' };
const stranger: any = { id: 'cust-2' };

describe('reading a booking', () => {
  it("is refused for someone else's booking, as if it didn't exist", async () => {
    const { service } = setup();
    await expect(service.getBookingById('BKID-1', stranger)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns your own booking without any password or reset code, yours or the salon owner\'s', async () => {
    const { service } = setup();

    const [booking]: any[] = await service.getBookingById('BKID-1', me);

    expect(booking.client.password).toBeUndefined();
    expect(booking.client.resetCode).toBeUndefined();
    expect(booking.client.firstName).toBe('Cee');
    expect(booking.business.owner.password).toBeUndefined();
    expect(booking.business.owner.resetCode).toBeUndefined();
    expect(booking.business.owner.verificationCode).toBeUndefined();
    expect(booking.business.owner.firstName).toBe('Olu');
  });
});

describe("changing someone else's booking", () => {
  it('cannot be cancelled', async () => {
    const { service } = setup();
    await expect(service.cancelBooking('BKID-1', stranger, 'note', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot be restored or rescheduled', async () => {
    const { service } = setup();
    await expect(service.restoreBooking('BKID-1', stranger)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.rescheduleBooking('BKID-1', stranger, new Date('2030-01-01'), '2:00 PM')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// A merchant creating a booking on behalf of a Client Management record never sets `client` at all
// (see BusinessService.createBooking) — only `businessClient`. A customer who is also that same real
// person, matched by email, still owns the booking even though `client` is empty.
function setupMerchantCreatedBooking() {
  const appointment: any = {
    id: 'a2',
    orderId: 'BKID-2',
    client: null,
    businessClient: { email: 'Real.Customer@Example.com' },
    business: { id: 'biz-1', owner: { id: 'owner-1' } },
  };
  const bookingRepository = { find: jest.fn().mockResolvedValue([appointment]), findOne: jest.fn().mockResolvedValue(appointment) };
  const noop: any = {};
  const service = new BookingService(
    bookingRepository as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    { getReviewedOrderIds: jest.fn().mockResolvedValue(new Set()) } as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service };
}

describe('a booking a merchant created directly (no client account linked)', () => {
  it('is readable by the real customer it was made for, matched by email', async () => {
    const { service } = setupMerchantCreatedBooking();
    const realCustomer: any = { id: 'cust-9', email: 'real.customer@example.com' }; // different case, same address

    const [booking]: any[] = await service.getBookingById('BKID-2', realCustomer);
    expect(booking.id).toBe('a2');
  });

  it("is still refused for someone else entirely", async () => {
    const { service } = setupMerchantCreatedBooking();
    const someoneElse: any = { id: 'cust-10', email: 'nobody@example.com' };

    await expect(service.getBookingById('BKID-2', someoneElse)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the user controller', () => {
  it('has no route that rewrites an account by id', () => {
    expect((UserController.prototype as any).updateUser).toBeUndefined();
  });
});
