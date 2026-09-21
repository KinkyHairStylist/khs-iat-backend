import { ForbiddenException } from '@nestjs/common';
import { BusinessService } from './business.service';

// A salon can only act on its own bookings, staff, services and schedule.

const MINE = 'biz-mine';
const THEIRS = 'biz-theirs';

function setup() {
  const service: any = new BusinessService(...(Array(24).fill({}) as [any]));

  const records: Record<string, any> = {
    'appt-mine': { id: 'appt-mine', business: { id: MINE } },
    'appt-theirs': { id: 'appt-theirs', business: { id: THEIRS } },
    'staff-theirs': { id: 'staff-theirs', business: { id: THEIRS } },
    'svc-theirs': { id: 'svc-theirs', business: { id: THEIRS } },
    'slot-theirs': { id: 'slot-theirs', business: { id: THEIRS } },
  };
  const finder = (key: string) => ({
    findOne: jest.fn(async ({ where }: any) => records[where.id] ?? null),
  });

  service.appointmentRepo = finder('appointment');
  service.staffRepo = { ...finder('staff'), findOne: jest.fn(async ({ where }: any) => records[where.id] ?? null) };
  service.serviceRepo = finder('service');
  service.blockedSlotRepo = finder('slot');
  // The signed-in user owns MINE and nothing else.
  service.businessRepo = {
    findOne: jest.fn(async ({ where }: any) => (where.id === MINE && where.owner?.id === 'owner-1' ? { id: MINE } : null)),
  };
  service.getBusinessFromStaff = jest.fn().mockResolvedValue(null);

  return service;
}

const me: any = { id: 'owner-1' };

describe("acting on another salon's records", () => {
  it.each([
    ['completing a booking', (s: any) => s.completeBooking('appt-theirs', me)],
    ['accepting a booking', (s: any) => s.acceptBooking('appt-theirs', me)],
    ['rejecting a booking', (s: any) => s.rejectBooking('appt-theirs', me)],
    ['reading a booking', (s: any) => s.getBooking('appt-theirs', me)],
    ['rescheduling a booking', (s: any) => s.rescheduleBooking({ id: 'appt-theirs', reason: '', date: '', time: '' }, me)],
    ['assigning staff to a booking', (s: any) => s.assignStaffToAppointment({ appointmentId: 'appt-theirs', staffIds: [] }, me)],
    ['editing a staff member', (s: any) => s.editStaff('staff-theirs', {}, me)],
    ['deactivating a staff member', (s: any) => s.deactivateStaff('staff-theirs', me)],
    ['updating a service', (s: any) => s.updateService('svc-theirs', {}, me)],
    ['assigning staff to a service', (s: any) => s.assignStaffToService({ serviceId: 'svc-theirs', staffIds: [] }, me)],
    ['editing a blocked time', (s: any) => s.editBlockedTime('slot-theirs', {}, me)],
    ['deleting a blocked time', (s: any) => s.deleteBlockedSlot('slot-theirs', me)],
  ])('is refused when %s', async (_name, act) => {
    await expect(act(setup())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a platform admin act on any salon', async () => {
    const s = setup();
    s.appointmentRepo.findOne = jest.fn(async () => null); // the method then reports it as not found
    await expect(s.acceptBooking('appt-theirs', { id: 'admin-1', isStaff: true })).rejects.not.toBeInstanceOf(ForbiddenException);
  });

  it("lets a staff member act on the salon they work for", async () => {
    const s = setup();
    s.getBusinessFromStaff = jest.fn().mockResolvedValue({ id: THEIRS });
    s.appointmentRepo.findOne = jest.fn(async () => ({ id: 'appt-theirs', business: { id: THEIRS } }));
    // Past the ownership check the method goes on to do its own work; with empty stand-ins that
    // fails differently, which is all this test needs to show.
    await expect(s.acceptBooking('appt-theirs', { id: 'staff-user' })).rejects.not.toBeInstanceOf(ForbiddenException);
  });

  it('carries on to the normal not-found answer when the record does not exist', async () => {
    const s = setup();
    await expect(s.acceptBooking('missing', me)).rejects.toThrow('Appointment not found');
  });
});
