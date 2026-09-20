import { AppointmentStatus } from 'src/business/entities/appointment.entity';
import { IntegrationAuthError } from '../integration.helpers';
import { IntegrationSyncService } from './integration-sync.service';

const business = { id: 'biz-1', ownerId: 'owner-1' };

const appt = (over: Record<string, any> = {}) => ({
  id: 'appt-1',
  orderId: 'BKID-1',
  amount: 60,
  status: AppointmentStatus.CONFIRMED,
  googleEventId: null,
  zohoInvoiceId: null,
  business,
  ...over,
});

describe('IntegrationSyncService', () => {
  let appointmentRepo: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let stripeRepo: { findOne: jest.Mock };
  let google: Record<string, jest.Mock>;
  let mailchimp: Record<string, jest.Mock>;
  let zoho: Record<string, jest.Mock>;
  let notifications: { create: jest.Mock };
  let service: IntegrationSyncService;

  beforeEach(() => {
    appointmentRepo = { find: jest.fn(), findOne: jest.fn(), update: jest.fn() };
    stripeRepo = { findOne: jest.fn().mockResolvedValue(null) };
    google = {
      isConnected: jest.fn().mockResolvedValue(false),
      createCalendarEvent: jest.fn().mockResolvedValue('evt-1'),
      updateCalendarEvent: jest.fn(),
      deleteCalendarEvent: jest.fn(),
      markDisconnected: jest.fn().mockResolvedValue(undefined),
    };
    mailchimp = {
      isConnected: jest.fn().mockResolvedValue(false),
      syncContact: jest.fn(),
      markDisconnected: jest.fn().mockResolvedValue(undefined),
    };
    zoho = {
      isConnected: jest.fn().mockResolvedValue(false),
      ensureInvoice: jest.fn().mockResolvedValue({ invoiceId: 'inv-1', created: true }),
      recordPayment: jest.fn(),
      voidInvoice: jest.fn(),
      markDisconnected: jest.fn().mockResolvedValue(undefined),
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new IntegrationSyncService(
      appointmentRepo as any,
      stripeRepo as any,
      google as any,
      mailchimp as any,
      zoho as any,
      notifications as any,
    );
  });

  describe('onBookingConfirmed', () => {
    it('does nothing for a salon with nothing connected', async () => {
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingConfirmed('BKID-1');
      expect(google.createCalendarEvent).not.toHaveBeenCalled();
      expect(mailchimp.syncContact).not.toHaveBeenCalled();
      expect(zoho.ensureInvoice).not.toHaveBeenCalled();
    });

    it('ignores cancelled appointments', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt({ status: AppointmentStatus.CANCELLED })]);
      await service.onBookingConfirmed('BKID-1');
      expect(google.createCalendarEvent).not.toHaveBeenCalled();
    });

    it('creates a calendar event and remembers its id', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingConfirmed('BKID-1');
      expect(google.createCalendarEvent).toHaveBeenCalledWith('appt-1');
      expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', { googleEventId: 'evt-1' });
    });

    it('updates rather than duplicates an event that already exists', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt({ googleEventId: 'evt-old' })]);
      await service.onBookingConfirmed('BKID-1');
      expect(google.updateCalendarEvent).toHaveBeenCalledWith('appt-1', 'evt-old');
      expect(google.createCalendarEvent).not.toHaveBeenCalled();
    });

    it('adds the client to Mailchimp once per order', async () => {
      mailchimp.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt(), appt({ id: 'appt-2' })]);
      await service.onBookingConfirmed('BKID-1');
      expect(mailchimp.syncContact).toHaveBeenCalledTimes(1);
      expect(mailchimp.syncContact).toHaveBeenCalledWith('appt-1');
    });

    it('records a card payment for a new invoice', async () => {
      zoho.isConnected.mockResolvedValue(true);
      stripeRepo.findOne.mockResolvedValue({ isDeposit: false });
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingConfirmed('BKID-1');
      expect(zoho.recordPayment).toHaveBeenCalledWith('appt-1', 'inv-1', 60, 'creditcard');
    });

    it('records only the 50% paid on a deposit booking', async () => {
      zoho.isConnected.mockResolvedValue(true);
      stripeRepo.findOne.mockResolvedValue({ isDeposit: true });
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingConfirmed('BKID-1');
      expect(zoho.recordPayment).toHaveBeenCalledWith('appt-1', 'inv-1', 30, 'creditcard');
    });

    it('does not record a second payment for an invoice that already existed', async () => {
      zoho.isConnected.mockResolvedValue(true);
      zoho.ensureInvoice.mockResolvedValue({ invoiceId: 'inv-1', created: false });
      appointmentRepo.find.mockResolvedValue([appt({ zohoInvoiceId: 'inv-1' })]);
      await service.onBookingConfirmed('BKID-1');
      expect(zoho.recordPayment).not.toHaveBeenCalled();
    });

    it('uses "others" as the payment mode when there was no card payment', async () => {
      zoho.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingConfirmed('BKID-1');
      expect(zoho.recordPayment).toHaveBeenCalledWith('appt-1', 'inv-1', 60, 'others');
    });

    it('marks an integration disconnected when its credentials stopped working, without throwing', async () => {
      google.isConnected.mockResolvedValue(true);
      google.createCalendarEvent.mockRejectedValue(new IntegrationAuthError('revoked'));
      appointmentRepo.find.mockResolvedValue([appt()]);
      await expect(service.onBookingConfirmed('BKID-1')).resolves.toBeUndefined();
      expect(google.markDisconnected).toHaveBeenCalledWith('biz-1', 'owner-1');
    });

    it('swallows an ordinary failure and still runs the other integrations', async () => {
      google.isConnected.mockResolvedValue(true);
      google.createCalendarEvent.mockRejectedValue(new Error('Google is down'));
      mailchimp.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt()]);
      await expect(service.onBookingConfirmed('BKID-1')).resolves.toBeUndefined();
      expect(google.markDisconnected).not.toHaveBeenCalled();
      expect(mailchimp.syncContact).toHaveBeenCalled();
    });
  });

  describe('onBookingCancelled', () => {
    it('removes the calendar event and forgets its id', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt({ googleEventId: 'evt-1' })]);
      await service.onBookingCancelled(['appt-1']);
      expect(google.deleteCalendarEvent).toHaveBeenCalledWith('biz-1', 'evt-1');
      expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', { googleEventId: null });
    });

    it('leaves appointments without an event alone', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt()]);
      await service.onBookingCancelled(['appt-1']);
      expect(google.deleteCalendarEvent).not.toHaveBeenCalled();
    });

    it('does not fail the cancellation when Zoho refuses to void a paid invoice', async () => {
      zoho.isConnected.mockResolvedValue(true);
      zoho.voidInvoice.mockRejectedValue(new Error('payments applied'));
      appointmentRepo.find.mockResolvedValue([appt({ zohoInvoiceId: 'inv-1' })]);
      await expect(service.onBookingCancelled(['appt-1'])).resolves.toBeUndefined();
      expect(zoho.voidInvoice).toHaveBeenCalledWith('appt-1');
    });

    it('tells the merchant, in plain words, when Zoho would not cancel an invoice', async () => {
      zoho.isConnected.mockResolvedValue(true);
      zoho.voidInvoice.mockRejectedValue(new Error('payments applied'));
      appointmentRepo.find.mockResolvedValue([
        appt({ zohoInvoiceId: 'inv-1', serviceName: 'Silk Press' }),
      ]);
      await service.onBookingCancelled(['appt-1']);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-1',
          title: 'A ZohoBooks invoice needs your attention',
          message: expect.stringContaining('credit note'),
        }),
      );
    });

    it('does not notify when the invoice was cancelled fine', async () => {
      zoho.isConnected.mockResolvedValue(true);
      appointmentRepo.find.mockResolvedValue([appt({ zohoInvoiceId: 'inv-1' })]);
      await service.onBookingCancelled(['appt-1']);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('still finishes if the notification itself fails', async () => {
      zoho.isConnected.mockResolvedValue(true);
      zoho.voidInvoice.mockRejectedValue(new Error('payments applied'));
      notifications.create.mockRejectedValue(new Error('db down'));
      appointmentRepo.find.mockResolvedValue([appt({ zohoInvoiceId: 'inv-1' })]);
      await expect(service.onBookingCancelled(['appt-1'])).resolves.toBeUndefined();
    });

    it('does nothing for an empty list', async () => {
      await service.onBookingCancelled([]);
      expect(appointmentRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('onBookingRescheduled', () => {
    it('updates the existing event', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.findOne.mockResolvedValue(appt({ googleEventId: 'evt-1' }));
      await service.onBookingRescheduled('appt-1');
      expect(google.updateCalendarEvent).toHaveBeenCalledWith('appt-1', 'evt-1');
    });

    it('creates an event if the booking never had one', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.findOne.mockResolvedValue(appt());
      await service.onBookingRescheduled('appt-1');
      expect(google.createCalendarEvent).toHaveBeenCalledWith('appt-1');
      expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', { googleEventId: 'evt-1' });
    });

    it('skips a cancelled appointment', async () => {
      google.isConnected.mockResolvedValue(true);
      appointmentRepo.findOne.mockResolvedValue(appt({ status: AppointmentStatus.CANCELLED }));
      await service.onBookingRescheduled('appt-1');
      expect(google.updateCalendarEvent).not.toHaveBeenCalled();
      expect(google.createCalendarEvent).not.toHaveBeenCalled();
    });
  });
});
