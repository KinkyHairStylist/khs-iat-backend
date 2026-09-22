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

describe('the user controller', () => {
  it('has no route that rewrites an account by id', () => {
    expect((UserController.prototype as any).updateUser).toBeUndefined();
  });
});
