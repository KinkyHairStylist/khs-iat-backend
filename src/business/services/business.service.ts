import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin, In, Not, Repository } from 'typeorm';
import {
  TransactionType,
  PaymentMethod,
} from '../entities/transaction.entity';
import {
  StripePaymentIntent,
  StripeEscrowStatus,
} from 'src/payment/entities/stripe-payment-intent.entity';
import { Business } from '../entities/business.entity';
import { User } from '../../all_user_entities/user.entity';
import { CreateBusinessDto } from '../dtos/requests/CreateBusinessDto';
import { getBusinessServices } from '../data/business.services';
import { BookingPoliciesData, BusinessServiceData } from '../types/constants';
import { getBookingPoliciesConfiguration } from '../data/booking-policies';
import { BusinessCategory } from '../types/category.enum';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../entities/appointment.entity';
import { CreateBookingDto } from '../dtos/requests/CreateBookingDto';
import { Staff } from '../entities/staff.entity';
import { StaffCommissionEarning } from '../entities/staff-commission-earning.entity';
import { EmailService } from '../../email/email.service';
import { TemplateService } from '../../email/template.service';
import { BookingDay } from '../entities/booking-day.entity';
import { BlockedTimeSlot } from '../entities/blocked-time-slot.entity';
import { CreateBlockedTimeDto } from '../dtos/requests/CreateBlockedTimeDto';
import { CreateServiceDto } from '../dtos/requests/CreateServiceDto';
import { UpdateServiceDto } from '../dtos/update-service.dto';
import { PriceType } from '../types/price-type.enum';
import { DeleteServiceDto } from '../dtos/delete-service.dto';
import { AssignStaffToServiceDto } from '../dtos/assign-staff-to-service.dto';
import { AssignStaffToBookingDto } from '../dtos/assign-staff-to-booking.dto';
import { Service } from '../entities/service.entity';
import { AdvertisementPlan } from '../entities/advertisement-plan.entity';
import { CreateStaffDto } from '../dtos/requests/AddStaffDto';
import { EmergencyContact } from '../entities/emergency-contact.entity';
import { ClientSchema } from '../entities/client.entity';
import { Address } from '../entities/address.entity';
import { EditStaffDto } from '../dtos/requests/EditStaffDto';
import { GoogleCalendarService } from 'src/integration/services/google-calendar.service';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { BusinessWalletService } from './wallet.service';
import { MailchimpService } from 'src/integration/services/mailchimp.service';
import { BusinessOwnerSettingsService } from './business-owner-settings.service';
import { ZohoBooksService } from 'src/integration/services/zohobooks.service';
import { PasswordUtil } from '../utils/password.util';
import { NotificationService } from 'src/notifications/notification.service';
import { MerchantSignupService } from './merchant-signup.service';
import { NotificationType } from 'src/notifications/notification.enum';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { promises } from 'dns';
import { Review } from '../entities/review.entity';
import { merchantPayout } from 'src/user/services/booking-fees';
import { assertCanManageBusiness } from '../utils/business-access';
import { summarizeStaffAppointments, weekBounds } from '../utils/staff-stats';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(StripePaymentIntent)
    private readonly stripePaymentIntentRepo: Repository<StripePaymentIntent>,
    @InjectRepository(BookingDay)
    private readonly bookingDayRepo: Repository<BookingDay>,

    @InjectRepository(BlockedTimeSlot)
    private readonly blockedSlotRepo: Repository<BlockedTimeSlot>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Staff)
    private staffRepo: Repository<Staff>,
    @InjectRepository(StaffCommissionEarning)
    private staffCommissionEarningRepo: Repository<StaffCommissionEarning>,
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
    @InjectRepository(AdvertisementPlan)
    private advertisementPlanRepo: Repository<AdvertisementPlan>,
    private readonly passwordUtil: PasswordUtil,
    @InjectRepository(EmergencyContact)
    private emergencyRepo: Repository<EmergencyContact>,

    @InjectRepository(Address)
    private addressRepo: Repository<Address>,

    @InjectRepository(Review)
    private reviewRepo: Repository<Review>,


    @InjectRepository(ClientSchema)
    private clientSchemaRepo: Repository<ClientSchema>,

    private googleCalendarService: GoogleCalendarService,
    private mailchimpService: MailchimpService,
    private emailService: EmailService,
    private templateService: TemplateService,
    private readonly walletService: BusinessWalletService,
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly zohoBooksService: ZohoBooksService,
    private readonly notificationService: NotificationService,
    private readonly merchantSignupService: MerchantSignupService,
  ) {}

  /**
   * Creates a new business linked to the authenticated user.
   * @param createBusinessDto The data for the new business.
   * @param owner The user entity of the business owner.
   * @returns The created business entity.
   */
  async create(
    createBusinessDto: CreateBusinessDto,
    owner: User,
    options: { sendUnderReviewEmail?: boolean } = {},
  ): Promise<Business> {
    if (!owner) {
      throw new BadRequestException('Owner is required to create a business');
    }

    // No payment, no merchant: the chosen start (a paid plan whose payment Stripe confirms, the
    // Trial or MVP) is checked BEFORE anything is created.
    const signup = await this.merchantSignupService.resolveSignup(
      owner,
      createBusinessDto.signup,
    );

    const business = this.businessRepo.create({
      ...createBusinessDto,
      owner,
      planTier: signup.planTier,
    });

    owner.isMerchant = true;
    owner.isCustomer = false;
    owner.isStaff = false;
    await this.userRepo.save(owner);

    business.ownerName = owner?.firstName + ' ' + owner?.surname || '';
    business.ownerEmail = owner?.email || '';
    business.ownerPhone = owner?.phoneNumber || '';

    // The business and its payment / MVP record are saved together.
    await this.businessRepo.manager.transaction(async (manager) => {
      await manager.save(Business, business);
      await this.merchantSignupService.recordSignup(business, signup, manager);
    });

    // Sign-up asks two questions that belong to the salon's owner settings.
    // A failure here must not fail the registration; the owner can still set
    // both later under Settings > Booking Rules.
    const { allowDoubleBookings, allowDepositPayment } =
      createBusinessDto.bookingPolicies ?? {};
    if (allowDoubleBookings !== undefined || allowDepositPayment !== undefined) {
      try {
        await this.businessOwnerSettingsService.update(owner.id, business.id, {
          ...(allowDoubleBookings !== undefined && {
            bookingRules: { allowDoubleBookings },
          }),
          ...(allowDepositPayment !== undefined && {
            pricingPolicies: { allowDepositPayment },
          }),
        });
      } catch (error) {
        Logger.error(
          `Failed to save sign-up booking choices for business ${business.id}: ${error.message}`,
        );
      }
    }

    try {
      // An admin adding a merchant approves them straight away, so "under review" would be wrong.
      if (options.sendUnderReviewEmail !== false) {
        this.emailService.sendMerchantUnderReviewEmail(
          business.ownerEmail || owner.email,
          business.businessName,
          business.id,
        );
      }
    } catch (error) {
      Logger.error(
        `Failed to send merchant under-review email: ${error.message}`,
      );
    }

    // Automatically create wallet
    await this.walletService.createWalletForBusiness({
      businessId: business.id,
      ownerId: owner.id,
      currency: WalletCurrency.AUD,
    });

    try {
      SlackService.notify({
        node: SlackNode.APPLICATION,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.INFO,
        type: SlackEventType.USER_TRIGGERED,
        trigger: `${business.ownerName || 'Merchant'} <${business.ownerEmail || owner.email}>`,
        body: `Merchant is now live on the platform
• Business: ${business.businessName}
• Owner: ${business.ownerName}
• Email: ${business.ownerEmail || owner.email}
• ID: ${business.id}`,
      });
    } catch (slackError) {
      Logger.error(
        `Failed to send Slack notification for new live business: ${slackError instanceof Error ? slackError.message : 'unknown error'}`,
      );
    }

    return business;
  }

  // May the signed-in user act on this business? A platform admin can; so can its owner, and a
  // staff member of it. Anyone else gets a 403, so a salon can't read or change another salon's
  // bookings, staff, services or schedule by guessing an id.
  private async assertCanActOnBusiness(user: User, businessId: string | undefined): Promise<void> {
    if (user?.isStaff) return;
    const userId = user?.id;
    if (!userId || !businessId) {
      throw new ForbiddenException('You can only manage your own business');
    }
    const owned = await this.businessRepo.findOne({ where: { id: businessId, owner: { id: userId } } });
    if (owned) return;
    const ownBusiness = await this.getBusinessFromStaff(userId);
    if (ownBusiness?.id === businessId) return;
    throw new ForbiddenException('You can only manage your own business');
  }

  // The checks below do nothing when the record doesn't exist, so each method's own "not found"
  // handling still applies.
  private async assertCanActOnAppointment(id: string, user: User): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({ where: { id }, relations: ['business'] });
    if (appointment) await this.assertCanActOnBusiness(user, appointment.business?.id);
  }

  private async assertCanActOnStaffMember(id: string, user: User): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { id }, relations: ['business'] });
    if (staff) await this.assertCanActOnBusiness(user, staff.business?.id);
  }

  private async assertCanActOnService(id: string, user: User): Promise<void> {
    const service = await this.serviceRepo.findOne({ where: { id }, relations: ['business'] });
    if (service) await this.assertCanActOnBusiness(user, service.business?.id);
  }

  private async assertCanActOnBlockedSlot(id: string, user: User): Promise<void> {
    const slot = await this.blockedSlotRepo.findOne({ where: { id }, relations: ['business'] });
    if (slot) await this.assertCanActOnBusiness(user, slot.business?.id);
  }

  async getBooking(id: string, user: User) {
    await this.assertCanActOnAppointment(id, user);
  const appointment = await this.appointmentRepo.findOne({
    where: { id },
    relations: ['client', 'businessClient', 'staff', 'service', 'service.assignedStaff'],
  });
  if (!appointment) return null;

  let review: Review | null = null;
  if (appointment.orderId) {
    review = await this.reviewRepo.findOne({
      where: { orderId: appointment.orderId },
    });
  }

  return { ...appointment, review };
}

  async completeBooking(id: string, user: User) {
    await this.assertCanActOnAppointment(id, user);
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['business', 'client', 'businessClient'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment Not Found');
    }

    const recipientEmail =
      appointment.client?.email ?? appointment.businessClient?.email;

    if (recipientEmail) {
      await this.emailService.sendEmail(
        recipientEmail,
        `Appointment with ${appointment.business.businessName} `,
        `your appointment has been completed on ${appointment.date} `,
        '',
      );
    }

    appointment.status = AppointmentStatus.COMPLETED;
    // Completing a service means it was paid for one way or another,
    // regardless of which payment method was used (cash/walk-in bookings
    // previously stayed stuck at Unpaid forever since nothing else here
    // sets this for non-Stripe payment methods).
    appointment.paymentStatus = PaymentStatus.PAID;

    if (appointment.client?.id) {
      try {
        await this.notificationService.create({
          userId: appointment.client.id,
          type: NotificationType.SYSTEM,
          title: 'Appointment Completed',
          message: `Your appointment at ${appointment.business?.businessName || 'the salon'} for ${appointment.serviceName} has been completed.`,
          link: '/customer/appointment',
          metadata: {
            appointmentId: appointment.id,
            salonId: appointment.business?.id,
            salonName: appointment.business?.businessName,
          },
        });
      } catch (err) {
        console.error('Failed to create in-app notification for completeBooking:', err);
      }
    }

    await this.appointmentRepo.save(appointment);

    // Release any Stripe escrow held for this booking now that the
    // appointment is done — a no-op for Paystack/gift-card/cash bookings,
    // which have no StripePaymentIntent row at all.
    try {
      const heldPaymentIntents = await this.stripePaymentIntentRepo.find({
        where: {
          orderId: appointment.orderId,
          status: StripeEscrowStatus.HELD,
        },
      });

      for (const spi of heldPaymentIntents) {
        const businessId = appointment.business.id;
        // `ownerId` is a direct column, always populated; `.owner` is a
        // non-eager relation that's often absent unless explicitly
        // requested (found while building the deposit-booking feature —
        // this exact line was silently no-op'ing the wallet payout
        // whenever `.owner` wasn't loaded).
        const ownerId = appointment.business.ownerId || appointment.business.owner?.id;
        if (!businessId || !ownerId) continue;

        try {
          await this.walletService.getWalletByBusinessId(businessId);
        } catch {
          await this.walletService.createWalletForBusiness({
            businessId,
            ownerId,
            currency: WalletCurrency.USD,
            description: 'Business wallet - auto-created from booking',
          });
        }

        // KHS's commission + acquisition fee come out of the merchant's
        // payout, for every booking type; the customer is never charged
        // them. (Bookings paid before that change carried the fees inside
        // bookingAmount, so subtracting them here gives the same result
        // for those.) Cancellation logic is unaffected — it operates on
        // the gross bookingAmount.
        // When a gift card paid most of the booking the fees can be more than the card payment held
        // here; whatever the payout can't cover is debited from the salon's wallet.
        const { credit: netAmount, shortfall } = merchantPayout(
          spi.bookingAmount,
          spi.acquisitionFeeAmount,
          spi.commissionFeeAmount,
        );

        // Informational staff commission — no staff wallet exists (staff
        // have no working login yet), so this only ever records a number
        // the merchant can see. Applied to netAmount (after KHS's own
        // cut, matching what's actually credited to the business above),
        // once per assigned staff member with a rate set.
        try {
          for (const staffMember of appointment.staff || []) {
            const rate = Number(staffMember.commissionRate);
            if (!rate || rate <= 0) continue;
            const commissionAmount = Math.round(netAmount * (rate / 100) * 100) / 100;
            await this.staffCommissionEarningRepo.save(
              this.staffCommissionEarningRepo.create({
                staffId: staffMember.id,
                businessId: appointment.business.id,
                orderId: appointment.orderId,
                netAmount,
                commissionRate: rate,
                commissionAmount,
              }),
            );
          }
        } catch (commissionError) {
          this.logger.error(
            `Failed to record staff commission for order ${appointment.orderId}: ${commissionError.message}`,
          );
          // Low priority — this is an informational ledger only (no staff
          // wallets exist yet), so nothing financial is actually stuck.
          SlackService.notify({
            node: SlackNode.PAYMENT,
            provider: SlackProvider.SYSTEM,
            severity: SlackSeverity.ERROR,
            type: SlackEventType.ERROR_ALERT,
            trigger: `Staff commission record failed for order ${appointment.orderId}`,
            body: `Failed to record an informational staff commission entry.
• Order: ${appointment.orderId}
• Error: ${commissionError instanceof Error ? commissionError.message : String(commissionError)}`,
          });
        }

        // Goes to pendingBalance, not balance — held for 48h so a
        // chargeback landing in that window is recovered from money never
        // handed out, rather than clawing back an already-released
        // balance (see WalletReleaseCronService).
        if (netAmount > 0) {
          await this.walletService.addFundsPending({
            businessId,
            recipientId: ownerId,
            senderId: spi.userId,
            amount: netAmount,
            type: TransactionType.EARNING,
            description: `Escrow release for completed booking ${appointment.orderId}`,
            referenceId: spi.stripePaymentIntentId,
            currency: WalletCurrency.USD,
            mode: 'Web',
            method: PaymentMethod.STRIPE,
          });
        }
        if (shortfall > 0) {
          // Split what is still owed between the two fees, in proportion, so each is recorded as
          // its own kind.
          const acquisition = Number(spi.acquisitionFeeAmount);
          const commission = Number(spi.commissionFeeAmount);
          const feeTotal = acquisition + commission;
          const acquisitionShare = feeTotal > 0 ? Math.round(((shortfall * acquisition) / feeTotal) * 100) / 100 : 0;
          const commissionShare = Math.round((shortfall - acquisitionShare) * 100) / 100;
          for (const [kind, amount] of [
            ['Acquisition', acquisitionShare],
            ['Commission', commissionShare],
          ] as const) {
            if (amount <= 0) continue;
            await this.walletService.debitWithPendingFallback({
              businessId,
              amount,
              type: TransactionType.FEE,
              feeSubtype: kind,
              referenceId: spi.stripePaymentIntentId,
              description: `${kind} on gift card booking ${appointment.orderId}`,
              senderId: ownerId,
            });
          }
        }

        spi.status = StripeEscrowStatus.RELEASED;
        spi.releasedAt = new Date();
        await this.stripePaymentIntentRepo.save(spi);
      }
    } catch (escrowError) {
      // This moves real customer money out of escrow — log loudly, but
      // completing the appointment must still succeed even if this fails.
      this.logger.error(
        `Failed to release Stripe escrow for order ${appointment.orderId}: ${escrowError.message}`,
        escrowError.stack,
      );
      // The appointment is already saved COMPLETED + PAID above — if
      // escrow release fails here, the merchant is never actually paid
      // and nothing else in the system will retry it.
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Escrow release failed for order ${appointment.orderId}`,
        body: `An appointment was marked completed and paid, but releasing its Stripe escrow to the merchant's wallet failed — the merchant is not actually paid, with no automatic retry.
• Order: ${appointment.orderId}
• Business: ${appointment.business?.businessName || appointment.business?.id}
• Error: ${escrowError instanceof Error ? escrowError.message : String(escrowError)}`,
      });
    }

    const settings = await this.businessOwnerSettingsService.findByBusinessId(
      appointment.business.id,
    );

    if (settings.integrations.mailChimp) {
      // sync client for email marketing
      try {
        await this.mailchimpService.syncContact(appointment.id);
      } catch (error) {
        console.error('Failed to sync contact to Mailchimp:', error);
      }
    }

    if (settings.integrations.googleCalendar) {
      //     // Update Google Calendar event
      if (appointment.googleEventId) {
        try {
          await this.googleCalendarService.updateCalendarEvent(
            id,
            appointment.googleEventId,
          );
        } catch (error) {
          console.error('Failed to update Google Calendar:', error);
        }
      }
    }

    if (settings.integrations.zohoBooks) {
      try {
        // Create the invoice if the booking doesn't have one yet (online bookings
        // get theirs when they are confirmed) and record the venue payment once.
        const { invoiceId, created } = await this.zohoBooksService.ensureInvoice(id);
        if (created) {
          await this.zohoBooksService.recordPayment(id, invoiceId, undefined, 'cash');
        }
        appointment.zohoInvoiceId = invoiceId;
      } catch (error) {
        console.error('Failed to sync with ZohoBooks:', error);
      }
    }

    return appointment;
  }

  async createBooking(
    dto: CreateBookingDto,
    clientId: string,
  ): Promise<Appointment> {
    const business = await this.businessRepo.findOne({
      where: { id: dto.businessId },
    });
    if (!business) throw new NotFoundException('Business not found');

    // clientId comes from Client Management (a CRM record scoped to this
    // business's owner), not a platform User — look it up accordingly.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId || '');
    const client = isUuid
      ? await this.clientSchemaRepo.findOne({
          where: { id: clientId, ownerId: business.ownerId, isActive: true },
        })
      : null;
    if (!client) throw new NotFoundException('Client not found');

    let staff: Staff[] = [];
    if (dto.staffIds && dto.staffIds.length > 0) {
      staff = await this.staffRepo.find({
        where: { id: In(dto.staffIds) },
      });

      if (staff.length !== dto.staffIds.length) {
        throw new NotFoundException('One or more staff members not found');
      }
    } else {
      const firstStaff = await this.staffRepo.findOne({
        where: { business: { id: business.id }, isActive: true },
      });
      if (firstStaff) {
        staff = [firstStaff];
      }
    }

    const orderId = `BKID-${Math.floor(1000000 + Math.random() * 9000000)}`;

    const appointment = this.appointmentRepo.create({
      businessClient: client,
      business,
      staff,
      serviceName: dto.serviceName,
      orderId,
      date: dto.date,
      time: dto.time,
      duration: dto.duration,
      amount: dto.amount ?? 0,
      specialRequests: dto.specialRequests ?? undefined,
      status: AppointmentStatus.PENDING,
      paymentStatus: dto.paymentStatus ?? PaymentStatus.UNPAID,
    });

    await this.appointmentRepo.save(appointment);

    const settings = await this.businessOwnerSettingsService.findByBusinessId(
      business.id,
    );

    if (settings.integrations.googleCalendar) {
      // Sync to Google Calendar
      try {
        const eventId = await this.googleCalendarService.createCalendarEvent(
          appointment.id,
        );
        appointment.googleEventId = eventId;
        await this.appointmentRepo.save(appointment);
      } catch (error) {
        console.error('Failed to sync to Google Calendar:', error);
        // Don't fail the appointment creation if calendar sync fails
      }
    }

    if (settings.integrations.mailChimp) {
      try {
        await this.mailchimpService.syncContact(appointment.id);
      } catch (error) {
        console.error('Failed to sync contact to Mailchimp:', error);
      }
    }

    return appointment;
  }

  async getAvailableSlotsForDate(userMail: string, date: string) {
    const business = await this.businessRepo.findOne({
      where: { ownerEmail: userMail },
    });
    if (!business) {
      throw new NotFoundException('Business id not found');
    }
    const businessId = business.id;

    const dayName = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
    }) as BookingDay['day'];

    const bookingDay = await this.bookingDayRepo.findOne({
      where: { business: { id: businessId }, day: dayName },
    });

    if (!bookingDay || !bookingDay.isOpen) return [];

    const appointments = await this.appointmentRepo.find({
      where: { date, business: { id: businessId } },
    });

    const blockedSlots = await this.blockedSlotRepo.find({
      where: { date, business: { id: businessId } },
    });

    return this.getAvailableSlots(bookingDay, appointments, blockedSlots);
  }

  isSlotBlocked(
    slot: string,
    blockedSlots: BlockedTimeSlot[],
    intervalMinutes = 30,
  ): boolean {
    const [slotHours, slotMinutes] = slot.split(':').map(Number);
    const slotStart = slotHours * 60 + slotMinutes;
    const slotEnd = slotStart + intervalMinutes;

    return blockedSlots.some((blocked) => {
      const [blockedStartH, blockedStartM] = blocked.startTime
        .split(':')
        .map(Number);
      const [blockedEndH, blockedEndM] = blocked.endTime.split(':').map(Number);

      const blockedStart = blockedStartH * 60 + blockedStartM;
      const blockedEnd = blockedEndH * 60 + blockedEndM;

      // overlap condition
      return slotStart < blockedEnd && slotEnd > blockedStart;
    });
  }

  async generateSlotsBetween(
    startTime: string,
    endTime: string,
    intervalMinutes = 60,
    serviceDurationMinutes = intervalMinutes,
  ): Promise<string[]> {
    const parseToMinutes = (time: string): number => {
      if (!time) throw new Error('Time value is missing');

      if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
        time = time.slice(0, 5);
      }

      if (!/^\d{1,2}:\d{2}$/.test(time)) {
        throw new Error(`Invalid time format: ${time}. Expected "HH:mm".`);
      }

      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const toHHMM = (minutes: number) => {
      const hh = Math.floor(minutes / 60)
        .toString()
        .padStart(2, '0');
      const mm = (minutes % 60).toString().padStart(2, '0');
      return `${hh}:${mm}`;
    };

    const start = parseToMinutes(startTime);
    const end = parseToMinutes(endTime);

    if (start >= end) return [];
    if (intervalMinutes <= 0) throw new Error('intervalMinutes must be > 0');
    if (serviceDurationMinutes <= 0)
      throw new Error('serviceDurationMinutes must be > 0');

    const slots: string[] = [];
    let current = start;

    while (current + serviceDurationMinutes <= end) {
      slots.push(toHHMM(current));
      current += intervalMinutes;
    }

    return slots;
  }

  async editBlockedTime(id: string, dto: CreateBlockedTimeDto, user: User) {
    await this.assertCanActOnBlockedSlot(id, user);
    const slot = await this.blockedSlotRepo.findOne({ where: { id } });
    if (!slot) {
      throw new NotFoundException('Blocked slot not found');
    }
    slot.date = dto.date;
    slot.title = dto.title;
    slot.startTime = dto.startTime;
    slot.endTime = dto.endTime;
    slot.teamMember = dto.teamMember;
    slot.type = dto.type;
    slot.description = dto.description;

    return this.blockedSlotRepo.save(slot);
  }

  async addStaff(
    ownerMail: string,
    createStaffDto: CreateStaffDto,
  ): Promise<Staff> {
    const {
      addresses,
      emergencyContacts,
      selectedServices,
      firstName,
      lastName,
      email,
      phoneNumber,
      gender,
      avatar,
      settings,
    } = createStaffDto;

    let business = await this.businessRepo.findOne({
      where: { ownerEmail: ownerMail },
    });

    if (!ownerMail) throw new Error('Invalid User');
    if (!business) business = await this.getBusinessFromStaff(ownerMail);
    if (!business) throw new NotFoundException('Business not found');

    const staffEmail = email.toLowerCase().trim();

    // Check if the email belongs to the authenticated user (business owner)
    if (staffEmail === ownerMail.toLowerCase()) {
      throw new BadRequestException('You cannot add yourself as staff');
    }

    // Check if user with this email already exists
    const user = await this.userRepo.findOne({
      where: { email: staffEmail },
    });

    // If user already exists, check if they're already staff at this business
    if (user) {
      const existingStaff = await this.staffRepo.findOne({
        where: {
          email: staffEmail,
          business: { id: business.id },
        },
      });

      if (existingStaff) {
        throw new BadRequestException(
          'This user is already a staff member at your business',
        );
      }
    }

    let tempPassword: string | undefined;

    if (user) {
      // Email exists - update existing user to be staff
      // Update user details
      user.firstName = firstName;
      user.surname = lastName;
      user.phoneNumber = phoneNumber;
      if (gender) user.gender = gender.toUpperCase() as any;
      if (avatar) user.avatarUrl = avatar;

      // Business staff are merchants
      user.isMerchant = true;
      user.isCustomer = false;
      user.isStaff = false;

      await this.userRepo.save(user);
    } else {
      // Email does not exist - create new user with password
      // Generate strong random password
      tempPassword =
        Math.random().toString(36).slice(-10) +
        Math.random().toString(36).toUpperCase().slice(-4) +
        ['!', '@', '#'][Math.floor(Math.random() * 3)];

      const hashedPassword = await this.passwordUtil.hashPassword(tempPassword);

      const newUser = this.userRepo.create({
        email: staffEmail,
        firstName,
        surname: lastName,
        password: hashedPassword,
        phoneNumber,
        gender: gender?.toUpperCase() as any,
        isVerified: true,
        avatarUrl: avatar,
        isMerchant: true,
        isCustomer: false,
        isStaff: false,
      });

      await this.userRepo.save(newUser);

      try {
        await this.emailService.sendStaffWelcomeEmail(
          staffEmail,
          firstName,
          business.businessName,
          tempPassword,
        );
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail staff creation if email fails
      }
    }

    // Create staff profile
    const staff = this.staffRepo.create({
      ...createStaffDto,
      email: staffEmail,
      business,
      settings: settings || undefined,
    });

    await this.staffRepo.save(staff);

    // Handle emergency contacts
    if (emergencyContacts?.length) {
      const cleanContacts = emergencyContacts.map((contact: any) => {
        const { id, ...rest } = contact;
        return this.emergencyRepo.create({ ...rest, staff });
      });
      staff.emergencyContacts = await this.emergencyRepo.save(cleanContacts);
    }

    // Handle addresses
    if (addresses?.length) {
      const cleanAddresses = addresses.map((addr: any) => {
        const { id, ...rest } = addr;
        return this.addressRepo.create({ ...rest, staff });
      });
      staff.addresses = await this.addressRepo.save(cleanAddresses);
    }

    // Handle assigned services
    if (selectedServices?.length) {
      staff.services = await this.serviceRepo.findByIds(selectedServices);
      await this.staffRepo.save(staff);
    }

    return staff;
  }

  async editStaff(staffId: string, editStaffDto: EditStaffDto, user: User): Promise<Staff> {
    await this.assertCanActOnStaffMember(staffId, user);
    const staff = await this.staffRepo.findOne({
      where: { id: staffId },
      relations: ['addresses', 'emergencyContacts'],
    });

    if (!staff) {
      throw new Error('Staff not found');
    }

    // Ensure user record stays as merchant when staff is edited
    if (staff.email) {
      const user = await this.userRepo.findOne({
        where: { email: staff.email },
      });
      if (user && !user.isMerchant) {
        user.isMerchant = true;
        user.isCustomer = false;
        await this.userRepo.save(user);
      }
    }

    Object.assign(staff, editStaffDto);

    if (editStaffDto.addresses) {
      await this.addressRepo.delete({ staff: { id: staff.id } });

      const newAddresses = editStaffDto.addresses.map((addr) =>
        this.addressRepo.create({ ...addr, staff }),
      );
      await this.addressRepo.save(newAddresses);
      staff.addresses = newAddresses;
    }

    if (editStaffDto.emergencyContacts) {
      await this.emergencyRepo.delete({ staff: { id: staff.id } });

      const newContacts = editStaffDto.emergencyContacts.map((contact) =>
        this.emergencyRepo.create({ ...contact, staff }),
      );
      await this.emergencyRepo.save(newContacts);
      staff.emergencyContacts = newContacts;
    }

    if (editStaffDto.settings) {
      staff.settings = editStaffDto.settings;
    }

    if (editStaffDto.servicesAssigned) {
      const services = await this.serviceRepo.findByIds(
        editStaffDto.servicesAssigned,
      );
      staff.services = services;
    }

    await this.staffRepo.save(staff);
    return staff;
  }

  async getBusinessFromStaff(userId: string) {
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
      relations: ['business', 'business.serviceList'],
    });

    if (staff?.business) {
      return staff.business;
    }

    const ownedBusiness = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
      relations: ['serviceList'],
    });

    if (ownedBusiness) {
      return ownedBusiness;
    }

    throw new Error('No staff found');
  }

  async createBlockedTime(userId: string, body: CreateBlockedTimeDto) {
    if (!userId) throw new Error('Invalid User');

    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });
    if (!business) business = await this.getBusinessFromStaff(userId);
    if (!business) throw new NotFoundException('Business not found');

    const blockedSlot = this.blockedSlotRepo.create({
      business,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      type: body.type,
      title: body.title,
      teamMember: body.teamMember,
      description: body.description,
    });

    return await this.blockedSlotRepo.save(blockedSlot);
  }

  async deleteBlockedSlot(slotId: string, user: User) {
    await this.assertCanActOnBlockedSlot(slotId, user);
    await this.blockedSlotRepo.delete({ id: slotId });
    return { message: 'Blocked time deleted successfully' };
  }

  async getBlockedSlots(userId: string) {
    if (!userId) throw new Error('Invalid User');

    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });
    if (!business) business = await this.getBusinessFromStaff(userId);
    if (!business) throw new NotFoundException('Business not found');

    const blockedSlots = await this.blockedSlotRepo.find({
      where: { business: { id: business.id } },
    });

    return blockedSlots;
  }

  getWeekdayFromString(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  async rescheduleBooking(
    body: {
      id: string;
      reason: string;
      date: string;
      time: string;
    },
    user: User,
  ) {
    const { id, date, time } = body;
    await this.assertCanActOnAppointment(id, user);

    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['business'],
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const dayName = this.getWeekdayFromString(body.date) as BookingDay['day'];

    const bookingDay = await this.bookingDayRepo.findOne({
      where: { business: { id: appointment.business.id }, day: dayName },
    });
    if (!bookingDay)
      throw new BadRequestException(`No booking schedule for ${dayName}`);
    if (!bookingDay.isOpen)
      throw new BadRequestException(`Business is closed on ${dayName}`);

    const appointments = await this.appointmentRepo.find({
      where: { date, business: { id: appointment.business.id } },
    });
    const blockedSlots = await this.blockedSlotRepo.find({
      where: {
        date: body.date,
        business: { id: appointment.business.id },
      },
    });

    const availableSlots = await this.getAvailableSlots(
      bookingDay,
      appointments,
      blockedSlots,
    );

    if (!availableSlots.includes(time)) {
      throw new BadRequestException(
        `The time ${time} on ${date} is not available.`,
      );
    }

    appointment.time = time;
    appointment.date = date;
    appointment.status = AppointmentStatus.RESCHEDULED;

    await this.appointmentRepo.save(appointment);

    //     // Update Google Calendar event
    if (appointment.googleEventId) {
      try {
        await this.googleCalendarService.updateCalendarEvent(
          id,
          appointment.googleEventId,
        );
      } catch (error) {
        console.error('Failed to update Google Calendar:', error);
      }
    }

    return appointment;
  }

  async getAvailableSlots(bookingDay, appointments, blockedSlots) {
    const slots = await this.generateSlotsBetween(
      bookingDay.startTime,
      bookingDay.endTime,
      30,
    );

    const bookedTimes = appointments.map((a) => a.time);

    return slots.filter(
      (time) =>
        !bookedTimes.includes(time) && !this.isSlotBlocked(time, blockedSlots),
    );
  }

  async rejectBooking(id: string, user: User) {
    await this.assertCanActOnAppointment(id, user);
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['client', 'business'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    appointment.status = AppointmentStatus.CANCELLED;

    if (appointment.client?.id) {
      try {
        await this.notificationService.create({
          userId: appointment.client.id,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'Booking Rejected',
          message: `Your booking at ${appointment.business?.businessName || 'the salon'} for ${appointment.serviceName} has been rejected.`,
          link: '/customer/appointment',
          metadata: {
            appointmentId: appointment.id,
            salonId: appointment.business?.id,
          },
        });
      } catch (err) {
        console.error('Failed to create in-app notification for rejectBooking:', err);
      }
    }

    await this.appointmentRepo.save(appointment);

    if (appointment.client?.email) {
      this.emailService.sendCancellationConfirmationEmail(
        appointment.client.email,
        appointment.client.firstName || 'Valued Customer',
        appointment.business?.businessName || 'the salon',
        appointment.serviceName || 'your service',
        appointment.date,
        appointment.time,
        'This booking was rejected by the business.',
      );
    }

    const settings = await this.businessOwnerSettingsService.findByBusinessId(
      appointment.business.id,
    );

    if (settings.integrations.googleCalendar) {
      //     // Update Google Calendar event
      if (appointment.googleEventId) {
        try {
          await this.googleCalendarService.updateCalendarEvent(
            id,
            appointment.googleEventId,
          );
        } catch (error) {
          console.error('Failed to update Google Calendar:', error);
        }
      }
    }

    return appointment;
  }

  async acceptBooking(id: string, user: User) {
    await this.assertCanActOnAppointment(id, user);
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['client', 'business'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    appointment.status = AppointmentStatus.CONFIRMED;

    if (appointment.client?.id) {
      try {
        await this.notificationService.create({
          userId: appointment.client.id,
          type: NotificationType.BOOKING_CONFIRMED,
          title: 'Booking Accepted',
          message: `Your booking at ${appointment.business?.businessName || 'the salon'} for ${appointment.serviceName} has been accepted.`,
          link: '/customer/appointment',
          metadata: {
            appointmentId: appointment.id,
            salonId: appointment.business?.id,
            salonName: appointment.business?.businessName,
          },
        });
      } catch (err) {
        console.error('Failed to create in-app notification for acceptBooking:', err);
      }
    }

    await this.appointmentRepo.save(appointment);

    if (appointment.client?.email) {
      this.emailService.sendBookingConfirmationEmail(
        appointment.client.email,
        appointment.client.firstName || 'Valued Customer',
        appointment.business?.businessName || 'the salon',
        appointment.serviceName || 'your service',
        appointment.date,
        appointment.time,
        appointment.orderId,
      );
    }

    const settings = await this.businessOwnerSettingsService.findByBusinessId(
      appointment.business.id,
    );

    if (settings.integrations.googleCalendar) {
      //     // Update Google Calendar event
      if (appointment.googleEventId) {
        try {
          await this.googleCalendarService.updateCalendarEvent(
            id,
            appointment.googleEventId,
          );
        } catch (error) {
          console.error('Failed to update Google Calendar:', error);
        }
      }
    }

    if (settings.integrations.mailChimp) {
      try {
        await this.mailchimpService.syncContact(appointment.id);
      } catch (error) {
        console.error('Failed to sync contact to Mailchimp:', error);
      }
    }

    return appointment;
  }

  async getBusinessServices(userId: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
      relations: ['serviceList', 'serviceList.assignedStaff'],
    });

    if (!userId) throw new Error('Invalid User');
    if (!business) business = await this.getBusinessFromStaff(userId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business.serviceList;
  }

  async getTeamMembers(userId: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });
    if (!userId) throw new Error('Invalid User');
    if (!business) business = await this.getBusinessFromStaff(userId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const staff = await this.staffRepo.find({
      where: {
        business: { id: business.id },
        isActive: true,
      },
      relations: ['business', 'addresses', 'emergencyContacts', 'services'],
    });

    // Informational commission-this-week per staff member — see
    // Staff.commissionRate / StaffCommissionEarning. No staff wallet
    // exists yet, this is purely for the merchant to see.
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const commissionRows = staff.length
      ? await this.staffCommissionEarningRepo
          .createQueryBuilder('sce')
          .select('sce.staffId', 'staffId')
          .addSelect('SUM(sce.commissionAmount)', 'total')
          .where('sce.staffId IN (:...staffIds)', { staffIds: staff.map((s) => s.id) })
          .andWhere('sce.createdAt >= :startOfWeek', { startOfWeek })
          .groupBy('sce.staffId')
          .getRawMany()
      : [];
    const commissionMap = new Map(commissionRows.map((r) => [r.staffId, Number(r.total)]));

    // Real per-staff rating — averaged from reviews now attributed to
    // this staff member via Review.staffId (see BookingService.rateBusiness).
    // Previously there was no such link at all, so this was always a
    // hardcoded frontend fallback.
    const ratingRows = staff.length
      ? await this.reviewRepo
          .createQueryBuilder('review')
          .select('review.staffId', 'staffId')
          .addSelect('AVG(review.rating)', 'avgRating')
          .addSelect('COUNT(review.id)', 'reviewCount')
          .where('review.staffId IN (:...staffIds)', { staffIds: staff.map((s) => s.id) })
          .groupBy('review.staffId')
          .getRawMany()
      : [];
    const ratingMap = new Map(
      ratingRows.map((r) => [r.staffId, { rating: Number(r.avgRating), reviews: Number(r.reviewCount) }]),
    );

    // Each person's bookings this week, what they earned, and who they see next: from the appointments they
    // are on. These were never sent before, so every card showed 0 and no next appointment.
    const week = weekBounds();
    const appointmentRows = staff.length
      ? await this.appointmentRepo
          .createQueryBuilder('a')
          .innerJoinAndSelect('a.staff', 's')
          .where('s.id IN (:...staffIds)', { staffIds: staff.map((m) => m.id) })
          .andWhere('a.date >= :from', { from: week.start })
          .getMany()
      : [];
    const rowsByStaff = new Map<string, typeof appointmentRows>();
    for (const appointment of appointmentRows) {
      for (const member of appointment.staff ?? []) {
        rowsByStaff.set(member.id, [...(rowsByStaff.get(member.id) ?? []), appointment]);
      }
    }

    return staff.map((s) => ({
      ...s,
      commissionEarnedThisWeek: commissionMap.get(s.id) ?? 0,
      rating: ratingMap.get(s.id)?.rating ?? 0,
      reviews: ratingMap.get(s.id)?.reviews ?? 0,
      ...summarizeStaffAppointments(rowsByStaff.get(s.id) ?? [], week),
    }));
  }

  async getAdvertisementPlans() {
    const plans = await this.advertisementPlanRepo.find();

    // If no advertisement plans exist, seed with default plans
    if (plans.length === 0) {
      const defaultPlans = [
        {
          planName: 'Basic',
          price: 69.99,
          durationDays: 30,
          description: 'Basic service promotion',
          features: ['Featured in search results', 'Basic analytics'],
          payable: 'Basic',
          isRecommended: false,
          boost: '1.2x',
        },
        {
          planName: 'Premium',
          price: 99.99,
          durationDays: 60,
          description: 'Enhanced service promotion',
          features: [
            'Top placement in search',
            'Detailed analytics',
            'Social media boost',
            'Priority support',
          ],
          payable: 'Premium',
          isRecommended: true,
          boost: '2x',
        },
        {
          planName: 'Elite',
          price: 149.99,
          durationDays: 90,
          description: 'Maximum service exposure',
          features: [
            'Premium placement',
            'Advanced analytics',
            'Marketing consultation',
            'Cross-platform promotion',
            'Dedicated support',
          ],
          payable: 'Elite',
          isRecommended: false,
          boost: '3.5x',
        },
      ];

      const savedPlans = await this.advertisementPlanRepo.save(defaultPlans);
      return savedPlans;
    }

    return plans;
  }

  async createService(userId: string, createServiceDto: CreateServiceDto) {
    if (!userId) throw new Error('Invalid User');

    const {
      category,
      serviceType,
      images,
      advertisementPlanId,
      assignedStaffId,
      name,
      description,
      price,
      duration,
      priceType,
      minPrice,
      maxPrice,
    } = createServiceDto;

    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });
    if (!business) business = await this.getBusinessFromStaff(userId);
    if (!business) throw new Error('Business not found');

    let advertisementPlan: AdvertisementPlan | undefined;
    if (advertisementPlanId) {
      const foundPlan = await this.advertisementPlanRepo.findOne({
        where: { id: advertisementPlanId },
      });
      if (!foundPlan) throw new Error('Advertisement plan not found');
      advertisementPlan = foundPlan;
    }

    let staff: Staff[] = [];
    if (assignedStaffId) {
      const foundStaff = await this.staffRepo.findOne({
        where: { id: assignedStaffId },
      });
      if (!foundStaff) throw new Error('Staff not found');
      staff = [foundStaff];
    }

    const service = this.serviceRepo.create({
      name,
      description,
      price,
      duration,
      business,
      category,
      serviceType,
      images,
      advertisementPlan,
      assignedStaff: staff,
      priceType,
      minPrice,
      maxPrice,
    });

    return this.serviceRepo.save(service);
  }

  async updateService(serviceId: string, updateServiceDto: UpdateServiceDto, user: User) {
    await this.assertCanActOnService(serviceId, user);
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Check if user has permission to update this service (business owner or staff)
    // This would typically be handled by the controller with user context

    // Object.assign only overwrites keys present on the DTO — switching
    // priceType without also clearing the now-irrelevant fields would leave
    // a stale minPrice/maxPrice (or price) behind, which the service card's
    // display logic reads before priceType and shows instead of the update.
    if (updateServiceDto.priceType === PriceType.FIXED) {
      service.minPrice = null as any;
      service.maxPrice = null as any;
    } else if (updateServiceDto.priceType === PriceType.VARIABLE) {
      service.price = null as any;
    }

    Object.assign(service, updateServiceDto);

    // Handle advertisement plan
    if (updateServiceDto.advertisementPlanId) {
      const advertisementPlan = await this.advertisementPlanRepo.findOne({
        where: { id: updateServiceDto.advertisementPlanId },
      });
      if (!advertisementPlan) throw new Error('Advertisement plan not found');
      service.advertisementPlan = advertisementPlan;
    }

    // Handle assigned staff
    if (updateServiceDto.assignedStaffId) {
      const staff = await this.staffRepo.findOne({
        where: { id: updateServiceDto.assignedStaffId },
      });
      if (!staff) throw new Error('Staff not found');
      service.assignedStaff = [staff];
    }

    return this.serviceRepo.save(service);
  }

  async deleteService(deleteServiceDto: DeleteServiceDto, user?: any) {
    const { serviceId } = deleteServiceDto;

    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }
    // Only the salon that offers a service (or an admin) can delete it.
    assertCanManageBusiness(user, service.business);

    // Check if service has any appointments
    const appointmentCount = await this.appointmentRepo.count({
      where: { service: { id: serviceId } },
    });

    if (appointmentCount > 0) {
      throw new BadRequestException(
        'Cannot delete service that has appointments',
      );
    }

    await this.serviceRepo.remove(service);
    return { message: 'Service deleted successfully' };
  }

  async assignStaffToService(assignStaffDto: AssignStaffToServiceDto, user: User) {
    const { serviceId, staffIds } = assignStaffDto;
    await this.assertCanActOnService(serviceId, user);

    // Find the service
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Find all staff members
    const staffMembers = await this.staffRepo.find({
      where: { id: In(staffIds), business: { id: service.business.id } },
    });

    if (staffMembers.length !== staffIds.length) {
      throw new NotFoundException(
        'One or more staff members not found or do not belong to this business',
      );
    }

    // Assign staff to service
    service.assignedStaff = staffMembers;
    await this.serviceRepo.save(service);

    return {
      message: 'Staff assigned to service successfully',
      serviceId: service.id,
      assignedStaffCount: staffMembers.length,
    };
  }

  // Sets ONE staff member's assigned services to exactly this list —
  // deliberately separate from assignStaffToService above, which sets a
  // SERVICE's whole staff roster and would silently unassign every other
  // staff member from a service if called once per staff member (the bug
  // the staff-management "Assign Task" flow was hitting: assigning staff
  // A to a service any other staff member B was already on would wipe B
  // off it, since assignStaffToService replaces the roster wholesale).
  // This only ever adds/removes THIS staffId from each service's roster.
  async setStaffServices(staffId: string, serviceIds: string[], ownerId: string) {
    const staffMember = await this.staffRepo.findOne({
      where: { id: staffId },
      relations: ['business'],
    });
    if (!staffMember) {
      throw new NotFoundException('Staff member not found');
    }
    if (staffMember.business.ownerId !== ownerId) {
      throw new NotFoundException('Staff member not found');
    }

    const [currentlyAssigned, toAssign] = await Promise.all([
      this.serviceRepo
        .createQueryBuilder('service')
        .innerJoin('service.assignedStaff', 'staff', 'staff.id = :staffId', { staffId })
        .leftJoinAndSelect('service.assignedStaff', 'allStaff')
        .where('service.businessId = :businessId', { businessId: staffMember.business.id })
        .getMany(),
      serviceIds.length
        ? this.serviceRepo.find({
            where: { id: In(serviceIds), business: { id: staffMember.business.id } },
            relations: ['assignedStaff'],
          })
        : Promise.resolve([]),
    ]);

    const wantedIds = new Set(serviceIds);
    const currentIds = new Set(currentlyAssigned.map((s) => s.id));

    // Remove this staff member from services no longer selected.
    const toRemoveFrom = currentlyAssigned.filter((s) => !wantedIds.has(s.id));
    for (const service of toRemoveFrom) {
      service.assignedStaff = (service.assignedStaff || []).filter((s) => s.id !== staffId);
      await this.serviceRepo.save(service);
    }

    // Add this staff member to newly-selected services (without touching
    // whoever else is already assigned to them).
    const toAddTo = toAssign.filter((s) => !currentIds.has(s.id));
    for (const service of toAddTo) {
      service.assignedStaff = [...(service.assignedStaff || []), staffMember];
      await this.serviceRepo.save(service);
    }

    staffMember.servicesAssigned = serviceIds;
    await this.staffRepo.save(staffMember);

    return {
      message: 'Staff services updated successfully',
      staffId,
      serviceIds,
    };
  }

  async assignStaffToAppointment(dto: AssignStaffToBookingDto, user: User) {
    const { appointmentId, staffIds } = dto;
    await this.assertCanActOnAppointment(appointmentId, user);

    // Find the appointment (booking)
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Find all staff members that belong to this business
    const staffMembers = await this.staffRepo.find({
      where: { id: In(staffIds), business: { id: appointment.business.id } },
    });

    if (staffMembers.length !== staffIds.length) {
      throw new NotFoundException(
        'One or more staff members not found or do not belong to this business',
      );
    }

    // Assign (replace) staff on the booking. The appointment.staff relation is
    // a ManyToMany, so it can hold multiple assigned staff members.
    appointment.staff = staffMembers;
    await this.appointmentRepo.save(appointment);

    return {
      message: 'Staff assigned to booking successfully',
      appointmentId: appointment.id,
      assignedStaffCount: staffMembers.length,
    };
  }

  async deactivateStaff(id: string, user: User) {
    await this.assertCanActOnStaffMember(id, user);
    const staff = await this.staffRepo.findOne({
      where: { id: id },
      relations: ['business'],
    });
    if (!staff) throw new Error('Staff not found');
    staff.isActive = false;
    await this.staffRepo.save(staff);

    if (staff.email) {
      const user = await this.userRepo.findOne({
        where: { email: staff.email },
      });
      if (user) {
        user.isMerchant = false;
        user.isCustomer = true;
        await this.userRepo.save(user);
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const subject = 'Your staff account has been deactivated';
      const message = `Your staff account at ${staff.business?.businessName || 'your salon'} has been deactivated by the business.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: staff.business?.businessName || 'Kinky Hairstylist',
        subject,
        clientName: staff.firstName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(staff.email, subject, message, html);
    }

    return staff;
  }

  async getRescheduledBookings(userId: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if (!business) {
      const staff = await this.staffRepo.findOne({
        where: { id: userId },
        relations: ['business'],
      });
      if (!staff?.business) throw new NotFoundException('Business not found');
      business = staff?.business;
    }

    if (!business) {
      throw new NotFoundException('Business does not exist');
    }

    return await this.appointmentRepo.find({
      where: {
        business: { id: business.id },
        status: AppointmentStatus.RESCHEDULED,
      },
      relations: ['business', 'staff', 'client', 'businessClient'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getBookings(userId: string, date?: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if (!business) {
      const staff = await this.staffRepo.findOne({
        where: { id: userId },
        relations: ['business'],
      });
      if (!staff?.business) throw new NotFoundException('Business not found');
      business = staff?.business;
    }

    if (!business) {
      throw new NotFoundException('Business does not exist');
    }

    return await this.appointmentRepo.find({
      where: {
        business: { id: business.id },
        ...(date ? { date } : {}),
      },
      relations: ['business', 'staff', 'client', 'businessClient'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  getServices(): BusinessServiceData[] {
    return getBusinessServices();
  }

  getBookingPoliciesConfiguration(): BookingPoliciesData[] {
    return getBookingPoliciesConfiguration();
  }

  async hasBusiness(userId: string): Promise<{ hasBusiness: boolean }> {
    // Check if user is a business owner
    const business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if (business) {
      return { hasBusiness: true };
    }

    // Check if user is a staff member
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
    });

    if (staff) {
      return { hasBusiness: true };
    }

    // User has neither business nor staff role
    return { hasBusiness: false };
  }

  // An endpoint to get business owner details
  async getBusinessOwnerDetails(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      surname: user.surname,
      email: user.email,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      avatarUrl: user.avatarUrl,
      isStaff: user.isStaff,
      isMerchant: user.isMerchant,
      isCustomer: user.isCustomer,
      createdAt: user.createdAt,
      verified: user.isVerified,
    };
  }

  // An endpoint to get business details
  async getBusinessDetails(userId: string) {
    // Check if user is a business owner
    const business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
      relations: ['owner'],
    });

    if (business) {
      // If category is empty, set default categories
      if (!business.category || business.category.length === 0) {
        business.category = [
          BusinessCategory.HAIR_SERVICES,
          BusinessCategory.NAIL_SERVICES,
          BusinessCategory.MAKEUP_SERVICES,
        ];
      }

      return {
        id: business.id,
        businessName: business.businessName,
        businessDescription: business.description,
        businessAddress: business.businessAddress,
        businessImage: business.businessImage,
        category: business.category,
        companySize: business.companySize,
        status: business.status,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
        owner: {
          firstName: business.owner.firstName,
          surname: business.owner.surname,
          email: business.owner.email,
          phoneNumber: business.owner.phoneNumber,
        },
      };
    }

    // TODO: check if staff has manager access to update categories

    // Check if user is a staff member
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
      relations: ['business', 'business.owner'],
    });

    if (staff && staff.business) {
      // If category is empty, set default categories
      if (!staff.business.category || staff.business.category.length === 0) {
        staff.business.category = [
          BusinessCategory.HAIR_SERVICES,
          BusinessCategory.NAIL_SERVICES,
          BusinessCategory.MAKEUP_SERVICES,
        ];
      }

      return {
        id: staff.business.id,
        businessName: staff.business.businessName,
        businessDescription: staff.business.description,
        businessAddress: staff.business.businessAddress,
        businessImage: staff.business.businessImage,
        category: staff.business.category,
        companySize: staff.business.companySize,
        status: staff.business.status,
        createdAt: staff.business.createdAt,
        updatedAt: staff.business.updatedAt,
        owner: {
          firstName: staff.business.owner.firstName,
          surname: staff.business.owner.surname,
          email: staff.business.owner.email,
          phoneNumber: staff.business.owner.phoneNumber,
        },
      };
    }

    throw new NotFoundException('No business found for this user');
  }

  async getBusinessPublicInfo(businessId: string) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return {
      success: true,
      data: {
        id: business.id,
        businessName: business.businessName,
        description: business.description,
        businessAddress: business.businessAddress,
        businessImage: business.businessImage,
        category: business.category,
        status: business.status,
        longitude: business.longitude,
        latitude: business.latitude,
        ownerName: business.ownerName,
      },
    };
  }

  async updateBusinessCategory(userId: string, categories: BusinessCategory[]) {
    // Check if user is a business owner
    const business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if (business) {
      business.category = categories;
      await this.businessRepo.save(business);
      return {
        message: 'Business categories updated successfully',
        businessId: business.id,
        category: business.category,
      };
    }

    // TODO: check if staff has manager access to update categories

    // Check if user is a staff member
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
      relations: ['business'],
    });

    if (staff && staff.business) {
      staff.business.category = categories;
      await this.businessRepo.save(staff.business);
      return {
        message: 'Business categories updated successfully',
        businessId: staff.business.id,
        category: staff.business.category,
      };
    }

    throw new NotFoundException('No business found for this user');
  }

  async removeBusinessCategories(
    userId: string,
    categoriesToRemove: BusinessCategory[],
  ) {
    // Check if user is a business owner
    const business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if (business) {
      // Ensure category array exists
      if (!business.category) {
        business.category = [];
      }

      // Filter out the categories to remove
      business.category = business.category.filter(
        (category) =>
          !categoriesToRemove.includes(category as BusinessCategory),
      );

      await this.businessRepo.save(business);
      return {
        message: 'Business categories removed successfully',
        businessId: business.id,
        remainingCategories: business.category,
      };
    }

    // TODO: check if staff has manager access to remove categories

    // Check if user is a staff member
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
      relations: ['business'],
    });

    if (staff && staff.business) {
      // Ensure category array exists
      if (!staff.business.category) {
        staff.business.category = [];
      }

      // Filter out the categories to remove
      staff.business.category = staff.business.category.filter(
        (category) =>
          !categoriesToRemove.includes(category as BusinessCategory),
      );

      await this.businessRepo.save(staff.business);
      return {
        message: 'Business categories removed successfully',
        businessId: staff.business.id,
        remainingCategories: staff.business.category,
      };
    }

    throw new NotFoundException('No business found for this user');
  }
}
