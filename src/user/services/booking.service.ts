import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { Service } from 'src/business/entities/service.entity';
import { Staff } from 'src/business/entities/staff.entity';
import {
  Transaction,
  TransactionType,
  PaymentMethod,
  TransactionStatus as TxnStatus,
} from 'src/business/entities/transaction.entity';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import {
  DEFAULT_CANCELLATION_WINDOW_HOURS,
  resolveCancellationWindowHours,
} from 'src/helpers/cancellation-window.helper';
import { IntegrationSyncService } from 'src/integration/services/integration-sync.service';
import {
  checkBookingAgainstRules,
  parseDurationToMinutes,
  resolveBookingRules,
  wallClockNowMs,
} from 'src/helpers/booking-rules.helper';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';
import { NotificationSettingsService } from './notification-settings.service';
import { PaystackService } from 'src/payment/paystack.service';
import { StripeService } from 'src/payment/stripe.service';
import {
  StripePaymentIntent,
  StripeEscrowStatus,
} from 'src/payment/entities/stripe-payment-intent.entity';
import {
  Refund,
  RefundStatus,
  RefundMethod,
} from 'src/user/user_entities/refund.entity';
import { NotificationService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/notification.enum';
import { SlackService } from 'src/slack/slack.service';
import { SlackService as StructuredSlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';
import { Card } from 'src/all_user_entities/card.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { assertGiftCardUsable } from './gift-card-usability';
import { User } from 'src/all_user_entities/user.entity';
import { ReviewService } from 'src/business/services/review.service';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { ClientSchema, ClientType } from 'src/business/entities/client.entity';
import { BusinessClientAcquisition } from 'src/business/entities/business-client-acquisition.entity';
import { Wallet } from 'src/business/entities/wallet.entity';
import { WalletStatus } from 'src/admin/payment/enums/wallet.enum';
import { MerchantMembershipPackage } from 'src/business/entities/merchant-membership-package.entity';
import {
  MerchantMembershipPurchase,
  MerchantMembershipPurchaseStatus,
} from 'src/business/entities/merchant-membership-purchase.entity';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Appointment)
    private bookingRepository: Repository<Appointment>,
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(BusinessGiftCard)
    private giftCardRepository: Repository<BusinessGiftCard>,
    @InjectRepository(ClientSchema)
    private clientRepository: Repository<ClientSchema>,
    @InjectRepository(Card)
    private cardRepository: Repository<Card>,
    @InjectRepository(StripePaymentIntent)
    private stripePaymentIntentRepository: Repository<StripePaymentIntent>,
    @InjectRepository(Refund)
    private refundRepository: Repository<Refund>,
    @InjectRepository(BusinessClientAcquisition)
    private businessClientAcquisitionRepository: Repository<BusinessClientAcquisition>,
    @InjectRepository(MerchantMembershipPackage)
    private membershipPackageRepository: Repository<MerchantMembershipPackage>,
    @InjectRepository(MerchantMembershipPurchase)
    private membershipPurchaseRepository: Repository<MerchantMembershipPurchase>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private platformSettingsService: PlatformSettingsService,
    private reviewService: ReviewService,
    private readonly dataSource: DataSource,
    private readonly paystack: PaystackService,
    private readonly stripeService: StripeService,
    private readonly walletService: BusinessWalletService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly notificationService: NotificationService,
    private readonly slackService: SlackService,
    private readonly integrationSync: IntegrationSyncService,
  ) {}

  // Keeps the salon's connected apps (Google Calendar, Mailchimp, ZohoBooks) in
  // step with a booking. Fire and forget: a slow or failing integration never
  // delays or fails the booking itself.
  private syncIntegrations(run: () => Promise<void>): void {
    void run().catch((err) =>
      this.logger.error(`Integration sync failed: ${err?.message}`),
    );
  }

  // Booking confirmation emails should only be sent if the customer hasn't
  // turned them off in Settings — defaults to true (matches the entity's
  // column default) if they've never saved a preference.
  private async shouldSendBookingConfirmationEmail(user: User): Promise<boolean> {
    const settings = await this.notificationSettingsService.getSettings(user);
    return settings.emailBookingConfirmations;
  }

  // Takes a fee from the salon's wallet, for a booking whose money was already credited to the salon
  // (a gift card bought earlier). Never fails the booking: it alerts instead.
  private async debitBookingFee(
    businessId: string,
    ownerId: string,
    amount: number,
    orderId: string,
    kind: 'Acquisition' | 'Commission',
  ): Promise<void> {
    try {
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
      await this.walletService.debitWithPendingFallback({
        businessId,
        amount,
        type: TransactionType.FEE,
        feeSubtype: kind,
        referenceId: orderId,
        description: `${kind === 'Acquisition' ? 'Acquisition fee' : 'Commission'} for appointment order ${orderId}`,
        senderId: ownerId,
      });
    } catch (error) {
      this.logger.error(`${kind} debit failed for order ${orderId}: ${error?.message}`);
      StructuredSlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.ERROR_ALERT,
        trigger: `${kind} not collected for order ${orderId}`,
        body: `A gift-card-paid booking was confirmed, but debiting the ${kind.toLowerCase()} from the salon's wallet failed, so KHS did not collect it.
• Order: ${orderId}
• Amount: $${amount.toFixed(2)}
• Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Computes the acquisition fee (tier %, one-time per business+client pair)
  // and the flat commission for a booking. Does NOT compute the Stripe
  // passthrough — that's charge-method-specific and handled separately in
  // the Stripe branch of confirmBooking, on the post-gift-card remainder.
  private async calculateBookingFees(
    business: Business,
    clientId: string,
    orderId: string,
    bookingAmount: number,
  ): Promise<{ acquisitionFeeAmount: number; commissionAmount: number }> {
    const payments = await this.platformSettingsService.getPayments();

    const claimResult = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(BusinessClientAcquisition)
      .values({ businessId: business.id, clientId, orderId })
      .orIgnore()
      .returning(['id'])
      .execute();
    // NOT claimResult.identifiers — TypeORM populates that from the input
    // values regardless of whether Postgres actually inserted the row or
    // silently skipped it via ON CONFLICT DO NOTHING. `.raw` reflects the
    // real RETURNING rows: empty when the insert was skipped (row already
    // existed), one row when it genuinely inserted.
    const isFirstBookingWithBusiness = claimResult.raw.length > 0;

    const acquisitionRate = isFirstBookingWithBusiness
      ? Number(payments.acquisitionFeeTiers?.[business.planTier]) || 0
      : 0;
    const commissionRate = Number(payments.commissionRate) || 0;

    return {
      acquisitionFeeAmount: bookingAmount * (acquisitionRate / 100),
      commissionAmount: bookingAmount * (commissionRate / 100),
    };
  }

  // Redeems session(s) from a MerchantMembershipPurchase to pay for a
  // booking instead of a card/gift card. The client already paid in full
  // at purchase time (see MembershipPackagePurchaseService.completePurchase)
  // — no commission was taken then. Commission is only taken here, per
  // session redeemed, same rate + calculation as gift-card redemption
  // (business-giftcard.service.ts's redeem()). Everything — the session
  // decrement, the fee Transaction, and the business wallet credit — runs
  // inside one transaction, unlike that gift-card precedent (whose wallet
  // credit runs outside its own transaction, a known gap not repeated here).
  private async redeemMembershipForBooking(
    membershipPurchaseId: string,
    appointments: Appointment[],
    orderId: string,
    user: User,
  ): Promise<any> {
    const purchase = await this.membershipPurchaseRepository.findOne({
      where: { id: membershipPurchaseId },
      relations: ['package', 'package.business', 'package.business.owner'],
    });
    if (!purchase) throw new NotFoundException('Membership purchase not found');
    if (purchase.clientId !== user.id) {
      throw new ForbiddenException('This membership purchase does not belong to you');
    }
    if (purchase.status !== MerchantMembershipPurchaseStatus.ACTIVE) {
      throw new BadRequestException('Membership purchase is not active');
    }
    if (purchase.expiresAt < new Date()) {
      throw new BadRequestException('Membership purchase has expired');
    }

    const pkg = purchase.package;
    if (!pkg || !pkg.business) {
      throw new NotFoundException('Membership package not found');
    }

    const sessionsNeeded = appointments.length;
    if (purchase.remainingSessions < sessionsNeeded) {
      throw new BadRequestException(
        `Only ${purchase.remainingSessions} session(s) remaining on this membership — this booking needs ${sessionsNeeded}`,
      );
    }
    if (pkg.business.id !== appointments[0].business.id) {
      throw new BadRequestException('This membership is not valid for this business');
    }
    if (appointments.some((a) => a.service?.id !== pkg.serviceId)) {
      throw new BadRequestException(
        'This membership only covers a specific service, which does not match this booking',
      );
    }

    const business = pkg.business;
    const ownerId = business.ownerId || business.owner?.id;
    if (!ownerId) {
      throw new BadRequestException('This business has no owner on record — cannot process membership redemption');
    }

    const pricePerSession = Number(pkg.pricePerSession);
    const payments = await this.platformSettingsService.getPayments();
    const commissionRate = Number(payments.commissionRate) || 0;
    const commissionPerSession = pricePerSession * (commissionRate / 100);
    const totalDebit = Math.round(pricePerSession * sessionsNeeded * 100) / 100;
    const totalCommission = Math.round(commissionPerSession * sessionsNeeded * 100) / 100;
    const totalNet = Math.round((totalDebit - totalCommission) * 100) / 100;

    await this.dataSource.manager.transaction(async (manager) => {
      purchase.remainingSessions -= sessionsNeeded;
      if (purchase.remainingSessions === 0) {
        purchase.status = MerchantMembershipPurchaseStatus.FULLY_REDEEMED;
      }
      await manager.save(MerchantMembershipPurchase, purchase);

      for (const appointment of appointments) {
        appointment.status = AppointmentStatus.CONFIRMED;
        appointment.paymentStatus = PaymentStatus.PAID;
        this.applyPendingRebookDate(appointment);
      }
      await manager.save(Appointment, appointments);

      await manager.save(
        Transaction,
        manager.create(Transaction, {
          senderId: user.id,
          recipientId: ownerId,
          amount: totalDebit,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.USD,
          description: `Membership session redemption for appointment order ${orderId}`,
          mode: 'Web',
          referenceId: orderId,
          status: TxnStatus.COMPLETED,
          method: PaymentMethod.STRIPE,
          service: 'Booking-MembershipRedemption',
          customerName: `${user.firstName} ${user.surname}`,
        }),
      );

      if (totalCommission > 0) {
        await manager.save(
          Transaction,
          manager.create(Transaction, {
            senderId: ownerId,
            amount: totalCommission,
            type: TransactionType.FEE,
            feeSubtype: 'Commission',
            currency: WalletCurrency.USD,
            description: `Commission for membership redemption on order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.COMPLETED,
            method: PaymentMethod.STRIPE,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          }),
        );
      }

      if (totalNet > 0) {
        let wallet = await manager.findOne(Wallet, { where: { businessId: business.id } });
        if (!wallet) {
          wallet = manager.create(Wallet, {
            businessId: business.id,
            ownerId,
            currency: WalletCurrency.USD,
            description: 'Business wallet - auto-created from membership redemption',
            balance: 0,
            totalIncome: 0,
            totalExpenses: 0,
            pendingBalance: 0,
            status: WalletStatus.ACTIVE,
          });
        }
        if (wallet.status !== WalletStatus.ACTIVE) {
          throw new BadRequestException('Business wallet is not active');
        }
        wallet = await manager.save(Wallet, wallet);

        const availableAt = new Date();
        availableAt.setHours(availableAt.getHours() + 48);

        await manager.save(
          Transaction,
          manager.create(Transaction, {
            walletId: wallet.id,
            senderId: user.id,
            recipientId: ownerId,
            amount: totalNet,
            type: TransactionType.EARNING,
            currency: WalletCurrency.USD,
            description: `Membership session redemption for order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.COMPLETED,
            method: PaymentMethod.STRIPE,
            availableAt,
          }),
        );

        wallet.pendingBalance = Number(wallet.pendingBalance) + totalNet;
        wallet.totalIncome = Number(wallet.totalIncome) + totalNet;
        await manager.save(Wallet, wallet);
      }
    });

    // The only confirmBooking branch that previously sent neither a
    // confirmation email nor a Slack notification.
    const serviceNames = [...new Set(appointments.map((a) => a.serviceName))].join(', ');
    await this.notifyMerchantOfNewBooking({
      businessId: business.id,
      orderId,
      customerId: user.id,
      customerName: `${user.firstName} ${user.surname}`,
      serviceNames,
      date: appointments[0].date,
      time: appointments[0].time,
      amountPaid: totalDebit,
      paymentNote: `Paid with membership (${sessionsNeeded} ${sessionsNeeded === 1 ? 'session' : 'sessions'} used)`,
    });
    this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));
    this.slackService.notify(
      `⭐ *Booking Confirmed via Membership Redemption*\n` +
      `• *Order ID*: \`${orderId}\`\n` +
      `• *Customer*: ${user.firstName || 'Customer'} ${user.surname || ''} (${user.email})\n` +
      `• *Salon*: ${business.businessName || 'the salon'}\n` +
      `• *Services*: ${serviceNames}\n` +
      `• *Sessions Used*: ${sessionsNeeded} (${purchase.remainingSessions} remaining)`,
    );
    if (user.email) {
      this.emailService.sendBookingConfirmationEmail(
        user.email,
        user.firstName || 'Customer',
        business.businessName || 'the salon',
        serviceNames,
        appointments[0].date,
        appointments[0].time,
        orderId,
        undefined,
        'Membership Redemption',
      );
    }

    return {
      message: 'Booking confirmed successfully using membership',
      sessionsUsed: sessionsNeeded,
      remainingSessions: purchase.remainingSessions,
      success: true,
    };
  }

  // Cancels earlier card payments for an order that were never paid, in Stripe and in the ledger. One
  // that has been paid (or is being paid) is left alone. Never throws: a failure only leaves the old
  // attempt as it was. At most 10 per call, so a long-standing pile clears over the next attempts.
  private async cancelStaleAttempts(attempts: StripePaymentIntent[]): Promise<void> {
    await Promise.allSettled(
      attempts.slice(0, 10).map(async (attempt) => {
        try {
          const intent = await this.stripeService.retrievePaymentIntent(attempt.stripePaymentIntentId);
          if (intent.status === 'succeeded' || intent.status === 'processing') return;
          if (intent.status !== 'canceled') {
            await this.stripeService.cancelPaymentIntent(attempt.stripePaymentIntentId);
          }
          await this.stripePaymentIntentRepository.update(
            { stripePaymentIntentId: attempt.stripePaymentIntentId },
            { status: StripeEscrowStatus.CANCELLED },
          );
          await this.transactionRepository.update(
            { referenceId: attempt.stripePaymentIntentId, status: TxnStatus.PENDING },
            { status: TxnStatus.CANCELLED },
          );
        } catch (error) {
          this.logger.warn(
            `Could not cancel the earlier payment attempt ${attempt.stripePaymentIntentId}: ${error?.message}`,
          );
        }
      }),
    );
  }

  // Confirms a booking that costs nothing: no payment, no fees, no wallet movement.
  private async confirmFreeBooking(
    appointments: Appointment[],
    orderId: string,
    user: User,
  ): Promise<any> {
    await this.dataSource.manager.transaction(async (manager) => {
      for (const appointment of appointments) {
        appointment.status = AppointmentStatus.CONFIRMED;
        appointment.paymentStatus = PaymentStatus.PAID;
        this.applyPendingRebookDate(appointment);
      }
      await manager.save(Appointment, appointments);
    });

    const business = appointments[0].business;
    const serviceNames = [...new Set(appointments.map((a) => a.serviceName))].join(', ');
    await this.notifyMerchantOfNewBooking({
      businessId: business?.id,
      orderId,
      customerId: user.id,
      customerName: `${user.firstName} ${user.surname}`,
      serviceNames,
      date: appointments[0].date,
      time: appointments[0].time,
      amountPaid: 0,
      paymentNote: 'Free booking, nothing to pay',
    });
    this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));
    this.slackService.notify(
      `🆓 *Free Booking Confirmed*\n` +
      `• *Order ID*: \`${orderId}\`\n` +
      `• *Customer*: ${user.firstName || 'Customer'} ${user.surname || ''} (${user.email})\n` +
      `• *Salon*: ${business?.businessName || 'the salon'}\n` +
      `• *Services*: ${serviceNames}`,
    );
    if (user.email) {
      this.emailService.sendBookingConfirmationEmail(
        user.email,
        user.firstName || 'Customer',
        business?.businessName || 'the salon',
        serviceNames,
        appointments[0].date,
        appointments[0].time,
        orderId,
        undefined,
        'Free booking',
      );
    }

    return {
      message: 'Booking confirmed successfully. There was nothing to pay.',
      totalAmount: 0,
      success: true,
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      value,
    );
  }

  // The business's own alerts (in-app + email) default to on: only an explicit
  // false in Settings > Notifications turns one off. KHS is always told (email
  // + Slack) whatever the business chose.
  private businessAlertEnabled(
    business: Business | null | undefined,
    alert: 'newBookingAlerts' | 'cancellationAlerts',
  ): boolean {
    return (
      business?.ownerSettings?.notifications?.businessNotifications?.[alert] !==
      false
    );
  }

  // Tells the salon (in-app + email) and KHS (email; Slack is sent by the
  // caller) that a booking was confirmed. amountPaid + no paymentNote means a
  // card payment; otherwise paymentNote says how it was paid, e.g. "Paid with
  // a gift card".
  private async notifyMerchantOfNewBooking(p: {
    businessId?: string;
    orderId: string;
    customerId: string;
    customerName: string;
    serviceNames: string;
    date: string;
    time: string;
    amountPaid: number;
    paymentNote?: string;
  }): Promise<void> {
    try {
      if (!p.businessId) return;
      const business = await this.businessRepository.findOne({
        where: { id: p.businessId },
        relations: ['owner', 'ownerSettings'],
      });
      if (!business) return;

      const merchantId = business.ownerId || business.owner?.id;
      const merchantEmail = business.ownerEmail || business.owner?.email;
      const merchantName =
        business.ownerName ||
        `${business.owner?.firstName ?? ''} ${business.owner?.surname ?? ''}`.trim() ||
        'Salon Owner';
      const businessAlerts = this.businessAlertEnabled(business, 'newBookingAlerts');
      const isCardPayment = !p.paymentNote;

      if (businessAlerts && merchantId) {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.BOOKING_CONFIRMED,
          title: isCardPayment ? 'New Booking & Payment Received' : 'New Booking Confirmed',
          message: isCardPayment
            ? `Payment of $${p.amountPaid.toFixed(2)} received for booking by ${p.customerName} (${p.serviceNames}).`
            : `A new booking has been placed by ${p.customerName} for ${p.serviceNames}.`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId: p.orderId,
            salonId: business.id,
            customerId: p.customerId,
            amountPaid: p.amountPaid,
          },
        });
      }

      // The salon's email copies KHS. If the salon turned alerts off, KHS still
      // gets the email on its own.
      const to = (businessAlerts && merchantEmail) || this.emailService.khsTeamEmail;
      if (to) {
        this.emailService.sendMerchantBookingNotificationEmail(
          to,
          merchantName,
          p.customerName,
          business.businessName || 'Your Salon',
          p.serviceNames,
          p.date,
          p.time,
          p.orderId,
          p.amountPaid,
          p.paymentNote,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to notify merchant of new booking ${p.orderId}:`, err);
    }
  }

  // Tells the salon (in-app + email) and KHS (email; Slack is sent by the
  // caller) that a client cancelled.
  private async notifyMerchantOfCancellation(p: {
    businessId?: string;
    orderId: string;
    customerId: string;
    customerName: string;
    serviceNames: string;
    date: string;
    time: string;
    moneyNote?: string;
  }): Promise<void> {
    try {
      if (!p.businessId) return;
      const business = await this.businessRepository.findOne({
        where: { id: p.businessId },
        relations: ['owner', 'ownerSettings'],
      });
      if (!business) return;

      const merchantId = business.ownerId || business.owner?.id;
      const merchantEmail = business.ownerEmail || business.owner?.email;
      const merchantName =
        business.ownerName ||
        `${business.owner?.firstName ?? ''} ${business.owner?.surname ?? ''}`.trim() ||
        'Salon Owner';
      const businessAlerts = this.businessAlertEnabled(business, 'cancellationAlerts');

      if (businessAlerts && merchantId) {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'Booking Cancelled',
          message: `${p.customerName} cancelled ${p.serviceNames} (${p.date} at ${p.time}).`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId: p.orderId,
            salonId: business.id,
            customerId: p.customerId,
          },
        });
      }

      const to = (businessAlerts && merchantEmail) || this.emailService.khsTeamEmail;
      if (to) {
        this.emailService.sendMerchantCancellationNotificationEmail(
          to,
          merchantName,
          p.customerName,
          business.businessName || 'Your Salon',
          p.serviceNames,
          p.date,
          p.time,
          p.orderId,
          p.moneyNote,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to notify merchant of cancellation ${p.orderId}:`, err);
    }
  }

  // Create Booking
  async createBooking(
    createBookingDto: any,
    user: User,
  ): Promise<{ orderId: string; appointments: Appointment[] }> {
    // Get business
    const business = await this.businessRepository.findOne({
      where: { id: createBookingDto.salonId },
      relations: ['bookingPolicies', 'ownerSettings'],
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Generate order ID
    const orderId = `BKID-${Math.floor(1000000 + Math.random() * 9000000)}`;

    const appointments: Appointment[] = [];

    // Create appointments for each service
    for (const serviceId of createBookingDto.serviceIds) {
      const service = await this.serviceRepository.findOne({
        where: { id: serviceId },
        relations:['assignedStaff'],
      });

      if (!service) {
        throw new NotFoundException(`Service with ID ${serviceId} not found`);
      }

      // Variable-priced services store price as null and hold the actual
      // range on minPrice/maxPrice — appointments.amount is NOT NULL, so
      // fall back to minPrice (then maxPrice). Final amount for
      // variable services is settled during confirmBooking / at venue.
      const bookingAmount = service.price ?? service.minPrice ?? service.maxPrice;
      // A service with no price at all used to be booked at $0. A price of 0 is a free service and
      // is fine; no price means the salon hasn't set one.
      if (bookingAmount === null || bookingAmount === undefined) {
        throw new BadRequestException(
          `"${service.name}" doesn't have a price yet, so it can't be booked online. Please contact the salon.`,
        );
      }

      const appointment = this.bookingRepository.create({
        client: user,
        business,
        service,
        serviceName: service.name,
        orderId,
        date: createBookingDto.date,
        time: createBookingDto.time,
        duration: service.duration,
        amount: bookingAmount,
        status: AppointmentStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        staff: service.assignedStaff || [],
      });

      appointments.push(appointment);
    }

    // The salon's scheduling rules (lead time, advance limit, same-day
    // cutoff, buffer, double booking) — checked before anything is saved.
    await this.assertBookingAllowedByRules(
      business,
      createBookingDto.date,
      createBookingDto.time,
      appointments.reduce((sum, a) => sum + parseDurationToMinutes(a.duration), 0) || 30,
      createBookingDto.timezoneOffsetMinutes,
    );

    // Save appointments
    await this.bookingRepository.save(appointments);

    return { orderId, appointments };
  }

  // Throws a BadRequestException with a client-readable reason when the
  // requested slot breaks the salon's booking rules. excludeOrderId lets a
  // reschedule ignore the appointment being moved.
  private async assertBookingAllowedByRules(
    business: Business,
    date: string,
    time: string,
    durationMinutes: number,
    timezoneOffsetMinutes?: number,
    excludeOrderId?: string,
  ): Promise<void> {
    const rules = resolveBookingRules(business);

    let existing: { date: string; time: string; duration: string }[] = [];
    if (!rules.allowDoubleBookings) {
      const qb = this.bookingRepository
        .createQueryBuilder('a')
        .select(['a.id', 'a.date', 'a.time', 'a.duration', 'a.status', 'a.createdAt'])
        .where('a.business_id = :businessId', { businessId: business.id })
        .andWhere('a.date = :date', { date: String(date).slice(0, 10) })
        .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED });
      if (excludeOrderId) {
        qb.andWhere('a."orderId" != :excludeOrderId', { excludeOrderId });
      }
      const rows = await qb.getMany();

      // An unpaid PENDING hold only blocks the slot until it expires, the
      // same window expireStalePendingBookings uses.
      const holdCutoff = Date.now() - BookingService.PENDING_EXPIRY_MINUTES * 60 * 1000;
      existing = rows.filter(
        (r) =>
          r.status !== AppointmentStatus.PENDING ||
          new Date(r.createdAt).getTime() >= holdCutoff,
      );
    }

    const problem = checkBookingAgainstRules({
      rules,
      date,
      time,
      durationMinutes,
      nowWallClockMs: wallClockNowMs(timezoneOffsetMinutes),
      existing,
    });
    if (problem) throw new BadRequestException(problem);
  }

  // Promotes a staged Rebook date/time onto the real date/time fields and
  // clears the staging columns. Called only at the point payment actually
  // succeeds — mutates in place, caller is responsible for saving.
  private applyPendingRebookDate(appointment: Appointment): void {
    if (appointment.pendingRebookDate && appointment.pendingRebookTime) {
      appointment.date = appointment.pendingRebookDate;
      appointment.time = appointment.pendingRebookTime;
      appointment.pendingRebookDate = undefined;
      appointment.pendingRebookTime = undefined;
    }
  }

  // ------------------------------------------------------
  // Step 1 — Confirm/Initialize Booking Payment
  // ------------------------------------------------------
  async confirmBooking(confirmBookingDto: any, user: User): Promise<any> {
    const { orderId, payAtVenue, cardId, giftCard, paymentProvider, depositOnly } =
      confirmBookingDto;
    if (depositOnly && paymentProvider !== 'stripe') {
      throw new BadRequestException('Deposit-only payment is only available with Stripe');
    }

    // Find all appointments for this orderId
    const appointments = await this.bookingRepository.find({
      where: { orderId, client: { id: user.id } },
      relations: ['business', 'business.owner', 'business.ownerSettings'],
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    // Merchants can turn the 50% deposit option off for their salon; unset counts as on.
    if (
      depositOnly &&
      appointments[0].business?.ownerSettings?.pricingPolicies?.allowDepositPayment === false
    ) {
      throw new BadRequestException('This salon does not accept deposit payments');
    }

    if (
      appointments.some(
        (appointment) => appointment.status === AppointmentStatus.CONFIRMED,
      )
    ) {
      throw new BadRequestException('Booking is already confirmed');
    }

    // Membership redemption is a standalone payment path — the client
    // already paid in full at purchase time, so this bypasses card/gift
    // card/Stripe entirely and just consumes session(s) from the purchase.
    if (confirmBookingDto.membershipPurchaseId) {
      return this.redeemMembershipForBooking(
        confirmBookingDto.membershipPurchaseId,
        appointments,
        orderId,
        user,
      );
    }

    // Calculate amounts
    const bookingAmount = appointments.reduce(
      (sum, appt) => sum + Number(appt.amount),
      0,
    );

    // Nothing to pay: confirm it straight away. This comes before the fees are worked out so a
    // free booking doesn't use up the customer's "first booking with this salon".
    if (bookingAmount <= 0) {
      return this.confirmFreeBooking(appointments, orderId, user);
    }

    // KHS's commission and acquisition fee come out of what the merchant is paid, not out of the
    // customer's pocket: the customer pays the service price (plus the card processing fee on
    // the Stripe path). The fees are worked out below and only recorded so they can be deducted
    // from the merchant.
    const totalAmount = bookingAmount;

    // Round to 2 decimal places
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Handle gift card payment if provided
    let giftCardPayment = 0;
    let remainingToPay = roundedTotalAmount;

    if (giftCard) {
      const gift = await this.giftCardRepository.findOne({
        where: { code: giftCard },
      });

      assertGiftCardUsable(gift, appointments[0].business.id);

      giftCardPayment = Math.min(
        Number(gift.remainingAmount),
        roundedTotalAmount,
      );
      remainingToPay = roundedTotalAmount - giftCardPayment;

      // Round to avoid floating point precision issues
      remainingToPay = Math.round(remainingToPay * 100) / 100;
    }

    // Acquisition fee (tier %, one-time per business+client) + flat commission — replaces the old
    // single flat platformFee. See calculateBookingFees for the race-safe first-booking detection.
    // Both are on the whole booking, whatever pays for it: a gift card doesn't waive them. The salon
    // was credited the gift card's full value when it was sold, so the part of the fees that the
    // card payment can't cover is debited from the salon's wallet.
    const { acquisitionFeeAmount, commissionAmount } =
      await this.calculateBookingFees(
        appointments[0].business,
        user.id,
        orderId,
        bookingAmount,
      );
    const feeAmount = acquisitionFeeAmount + commissionAmount;
    // Who the fee transactions below are recorded against.
    const feePayerId = appointments[0].business?.owner?.id ?? user.id;

    // Handle full gift card payment (no card needed) - check this FIRST
    if (remainingToPay <= 0) {
      return await this.dataSource.manager.transaction(async (manager) => {
        // Locked so two confirmations racing on one card cannot both spend it.
        const gift = await manager.findOne(BusinessGiftCard, {
          where: { code: giftCard },
          lock: { mode: 'pessimistic_write' },
        });
        assertGiftCardUsable(gift, appointments[0].business.id);
        if (Number(gift.remainingAmount) < totalAmount) {
          throw new BadRequestException('Insufficient gift card balance');
        }

        // Deduct from gift card
        gift.remainingAmount = Number(gift.remainingAmount) - totalAmount;
        if (gift.remainingAmount === 0) {
          gift.status = BusinessGiftCardStatus.USED;
          gift.redeemedAt = new Date();
        }
        await manager.save(BusinessGiftCard, gift);

        // Update appointments
        for (const appointment of appointments) {
          appointment.status = AppointmentStatus.CONFIRMED;
          appointment.paymentStatus = PaymentStatus.PAID;
          this.applyPendingRebookDate(appointment);
        }
        await manager.save(Appointment, appointments);

        // Create transaction for booking payment
        const bookingTx = manager.create(Transaction, {
          senderId: user.id,
          recipientId: appointments[0].business.owner?.id,
          amount: bookingAmount,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.USD,
          description: `Gift card payment for appointment order ${orderId}`,
          mode: 'Web',
          referenceId: orderId,
          status: TxnStatus.COMPLETED,
          method: PaymentMethod.GIFTCARD,
          service: 'Booking',
          customerName: `${user.firstName} ${user.surname}`,
        });
        await manager.save(Transaction, bookingTx);

        // The salon was credited the gift card's full value when it was sold, so both fees are
        // debited from its wallet. That records them too.
        if (acquisitionFeeAmount > 0) {
          await this.debitBookingFee(appointments[0].business.id, feePayerId, acquisitionFeeAmount, orderId, 'Acquisition');
        }
        if (commissionAmount > 0) {
          await this.debitBookingFee(appointments[0].business.id, feePayerId, commissionAmount, orderId, 'Commission');
        }

        // The salon is not credited here: it was paid when the gift card was bought. Crediting it
        // again would pay for the same money twice.

        if (user.email && (await this.shouldSendBookingConfirmationEmail(user))) {
          const serviceNames = [
            ...new Set(appointments.map((a) => a.serviceName)),
          ].join(', ');
          this.emailService.sendBookingConfirmationEmail(
            user.email,
            user.firstName || 'Valued Customer',
            appointments[0].business?.businessName || 'the salon',
            serviceNames,
            appointments[0].date,
            appointments[0].time,
          );
        }

        try {
          const serviceNames = [
            ...new Set(appointments.map((a) => a.serviceName)),
          ].join(', ');
          await this.notifyMerchantOfNewBooking({
            businessId: appointments[0].business?.id,
            orderId,
            customerId: user.id,
            customerName: `${user.firstName} ${user.surname}`,
            serviceNames,
            date: appointments[0].date,
            time: appointments[0].time,
            amountPaid: bookingAmount,
            paymentNote: `Paid $${bookingAmount.toFixed(2)} with a gift card`,
          });
          this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));
          this.slackService.notify(
            `🎁 *Booking Confirmed via Gift Card*\n` +
            `• *Order ID*: \`${orderId}\`\n` +
            `• *Customer*: ${user.firstName || 'Customer'} ${user.surname || ''} (${user.email})\n` +
            `• *Salon*: ${appointments[0].business?.businessName || 'the salon'}\n` +
            `• *Services*: ${serviceNames}\n` +
            `• *Appointment*: ${appointments[0].date} at ${appointments[0].time}\n` +
            `• *Total*: $${totalAmount.toFixed(2)}`
          );
        } catch (slackErr) {
          this.logger.error('Failed to send Slack gift card booking notification:', slackErr);
        }

        return {
          message: 'Booking confirmed successfully with gift card',
          bookingAmount,
          fees: { acquisitionFee: acquisitionFeeAmount, commission: commissionAmount },
          totalAmount,
          giftCardAmountUsed: totalAmount,
          success: true,
        };
      });
    }

    // Pay-at-venue disabled — no longer an offered payment option. Kept
    // commented out (not deleted) rather than removing payAtVenue from the
    // DTO, since the frontend still always sends payAtVenue: false.
    /*
    if (payAtVenue && remainingToPay > 0) {
      return await this.dataSource.manager.transaction(async (manager) => {
        // Deduct from gift card if provided
        if (giftCard && giftCardPayment > 0) {
          const gift = await manager.findOne(BusinessGiftCard, {
            where: { code: giftCard },
          });
          if (!gift || gift.remainingAmount < giftCardPayment) {
            throw new BadRequestException('Insufficient gift card balance');
          }
          gift.remainingAmount = Number(gift.remainingAmount) - giftCardPayment;
          if (gift.remainingAmount === 0) {
            gift.status = BusinessGiftCardStatus.USED;
            gift.redeemedAt = new Date();
          }
          await manager.save(BusinessGiftCard, gift);
        }

        // Update appointments
        for (const appointment of appointments) {
          appointment.status = AppointmentStatus.CONFIRMED;
          appointment.paymentStatus = PaymentStatus.UNPAID; // Pay at venue - will be paid later
          this.applyPendingRebookDate(appointment);
        }
        await manager.save(Appointment, appointments);

        // Create transaction for gift card portion
        if (giftCardPayment > 0) {
          const giftCardTx = manager.create(Transaction, {
            senderId: user.id,
            recipientId: appointments[0].business.owner?.id,
            amount: giftCardPayment,
            type: TransactionType.DEBIT,
            currency: WalletCurrency.USD,
            description: `Gift card payment for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.COMPLETED,
            method: PaymentMethod.GIFTCARD,
            service: 'Booking',
            customerName: `${user.firstName} ${user.surname}`,
          });
          await manager.save(Transaction, giftCardTx);
        }

        // Create transaction for pay at venue
        const payAtVenueSurcharge = 10; // Additional charge for pay at venue
        const venueTx = manager.create(Transaction, {
          senderId: user.id,
          recipientId: appointments[0].business.owner?.id,
          amount: remainingToPay + payAtVenueSurcharge,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.USD,
          description: `Pay at venue for appointment order ${orderId} (includes ${payAtVenueSurcharge} surcharge)`,
          mode: 'Web',
          referenceId: orderId,
          status: TxnStatus.PENDING,
          method: PaymentMethod.CASH,
          service: 'Booking',
          customerName: `${user.firstName} ${user.surname}`,
        });
        await manager.save(Transaction, venueTx);

        // Create acquisition + commission fee transactions
        if (acquisitionFeeAmount > 0) {
          const acqTx = manager.create(Transaction, {
            senderId: feePayerId,
            amount: acquisitionFeeAmount,
            type: TransactionType.FEE,
            feeSubtype: 'Acquisition',
            currency: WalletCurrency.USD,
            description: `Acquisition fee for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.PENDING,
            method: PaymentMethod.CASH,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          });
          await manager.save(Transaction, acqTx);
        }
        if (commissionAmount > 0) {
          const commTx = manager.create(Transaction, {
            senderId: feePayerId,
            amount: commissionAmount,
            type: TransactionType.FEE,
            feeSubtype: 'Commission',
            currency: WalletCurrency.USD,
            description: `Commission for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.PENDING,
            method: PaymentMethod.CASH,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          });
          await manager.save(Transaction, commTx);
        }

        if (user.email && (await this.shouldSendBookingConfirmationEmail(user))) {
          const serviceNames = [
            ...new Set(appointments.map((a) => a.serviceName)),
          ].join(', ');
          this.emailService.sendBookingConfirmationEmail(
            user.email,
            user.firstName || 'Valued Customer',
            appointments[0].business?.businessName || 'the salon',
            serviceNames,
            appointments[0].date,
            appointments[0].time,
          );
        }

        try {
          const serviceNames = [
            ...new Set(appointments.map((a) => a.serviceName)),
          ].join(', ');
          await this.notificationService.create({
            userId: user.id,
            type: NotificationType.BOOKING_CONFIRMED,
            title: 'Booking Confirmed',
            message: `Your booking at ${appointments[0].business?.businessName || 'the salon'} for ${serviceNames} has been confirmed.`,
            link: '/customer/bookings',
            metadata: {
              orderId,
              salonId: appointments[0].business?.id,
              salonName: appointments[0].business?.businessName,
            },
          });
        } catch (err) {
          this.logger.error('Failed to create in-app notification for pay-at-venue:', err);
        }

    try {
      const firstAppointment = appointments[0];
      const serviceNames = [...new Set(appointments.map((a) => a.serviceName))].join(', ');
      const dueAtVenue = remainingToPay + payAtVenueSurcharge;
      await this.notifyMerchantOfNewBooking({
        businessId: firstAppointment.business?.id,
        orderId,
        customerId: user.id,
        customerName: `${user.firstName} ${user.surname}`,
        serviceNames,
        date: firstAppointment.date,
        time: firstAppointment.time,
        amountPaid: 0,
        paymentNote: `Client pays $${dueAtVenue.toFixed(2)} at the venue`,
      });
      this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));

      this.slackService.notify(
        `📅 *Booking Confirmed (Pay at Venue)*\n` +
        `• *Order ID*: \`${orderId}\`\n` +
        `• *Customer*: ${user.firstName || 'Customer'} ${user.surname || ''} (${user.email})\n` +
        `• *Salon*: ${firstAppointment.business?.businessName || 'the salon'}\n` +
        `• *Services*: ${serviceNames}\n` +
        `• *Appointment*: ${firstAppointment.date} at ${firstAppointment.time}\n` +
        `• *Amount to Pay at Venue*: $${(remainingToPay + payAtVenueSurcharge).toFixed(2)}`
      );
    } catch (err) {
      this.logger.error('Failed to send merchant or Slack booking notification:', err);
    }

        return {
          message: 'Booking confirmed. Payment will be collected at venue.',
          user,
          bookingAmount,
          fees: { acquisitionFee: acquisitionFeeAmount, commission: commissionAmount },
          totalAmount: roundedTotalAmount,
          giftCardAmountUsed: giftCardPayment,
          payAtVenueAmount: remainingToPay + payAtVenueSurcharge,
          success: true,
        };
      });
    }
    */

    // If remaining amount exists and no card ID provided, throw error —
    // Stripe doesn't use a pre-saved cardId the way Paystack does, so this
    // guard only applies to the Paystack path.
    if (paymentProvider !== 'stripe' && remainingToPay > 0 && !cardId) {
      throw new BadRequestException(
        'Payment method required for remaining amount',
      );
    }

    // Validate card if provided
    let card: Card | null = null;
    if (remainingToPay > 0 && cardId) {
      card = await this.cardRepository.findOne({
        where: { id: cardId },
        relations: ['user'],
      });

      if (!card) throw new NotFoundException('Payment card not found');
      if (card.user?.id !== user.id) {
        throw new ForbiddenException('You cannot use this payment method');
      }
    }

    // Handle card payment via Stripe — a fully separate path from Paystack
    // below. Stripe funds are held in escrow (StripePaymentIntent) and only
    // credited to the business wallet when the appointment is later marked
    // Completed, unlike Paystack's immediate-credit-on-payment model.
    if (paymentProvider === 'stripe' && remainingToPay > 0) {
      const businessId = appointments[0].business.id;

      // Deposit-only: charge 50% of the raw service price (e.g. $250 ->
      // $125), not 50% of remainingToPay (which already has acquisition/
      // commission added in) — a $250 service is always a $125 deposit,
      // regardless of what tier/fees apply. Acquisition/commission stay
      // computed on the full bookingAmount above (unchanged) — they're
      // extracted from this smaller deposit charge at completion time
      // (see BusinessService.completeBooking), not added on top of it.
      // The other 50% of the full price is paid directly to the merchant
      // at the venue — KHS never charges, tracks, or takes a cut of it.
      // Gift cards aren't accounted for here — a deposit-only booking
      // combined with a gift card isn't a specified scenario.
      const depositChargeBase = depositOnly ? bookingAmount * 0.5 : remainingToPay;

      // Stripe passthrough is computed on the actual amount going through
      // Stripe (the deposit base above, or the full remainder for a
      // normal booking) — and added on top of the charge, not subtracted
      // from anything. This is the one fee that's genuinely new charge-
      // side logic (acquisition/commission just replace the old single
      // flat fee, computed the same additive way).
      const passthroughPayments = await this.platformSettingsService.getPayments();
      const stripePassthroughAmount =
        Math.round(
          (depositChargeBase * (Number(passthroughPayments.stripePassthroughRate) || 0) / 100 +
            (Number(passthroughPayments.stripePassthroughFixedFee) || 0)) *
            100,
        ) / 100;
      const stripeChargeAmount = depositChargeBase + stripePassthroughAmount;
      // Stripe refuses a charge under $0.50, which would only show up as a payment form that
      // never loads.
      if (Math.round(stripeChargeAmount * 100) < 50) {
        throw new BadRequestException(
          'Card payments have a minimum of $0.50. This booking is too small to pay by card.',
        );
      }
      // Informational only — the other 50% of the full price, due
      // directly to the merchant at the venue. Not persisted anywhere;
      // KHS has no further involvement with it.
      const remainingAtVenue = depositOnly
        ? Math.round((bookingAmount - depositChargeBase) * 100) / 100
        : 0;

      // A new attempt replaces this order's earlier unpaid ones (the customer reloaded the page or
      // changed the deposit or gift card), so an order has one live attempt instead of a pile.
      const staleAttempts = await this.stripePaymentIntentRepository.find({
        where: { orderId, status: StripeEscrowStatus.PENDING },
      });
      void this.cancelStaleAttempts(staleAttempts);

      const paymentIntent = await this.stripeService.createPaymentIntent({
        amount: Math.round(stripeChargeAmount * 100), // Convert to cents
        currency: 'usd',
        customerEmail: user.email,
        metadata: {
          orderId,
          userId: user.id,
          businessId,
          bookingAmount,
          feeAmount,
          stripePassthroughAmount,
          isDeposit: String(!!depositOnly),
        },
      });

      const stripePaymentIntent = this.stripePaymentIntentRepository.create({
        orderId,
        businessId,
        userId: user.id,
        stripePaymentIntentId: paymentIntent.id,
        amount: stripeChargeAmount,
        currency: 'usd',
        bookingAmount: depositChargeBase,
        acquisitionFeeAmount,
        commissionFeeAmount: commissionAmount,
        stripePassthroughFeeAmount: stripePassthroughAmount,
        isDeposit: !!depositOnly,
        status: StripeEscrowStatus.PENDING,
      });
      await this.stripePaymentIntentRepository.save(stripePaymentIntent);

      const stripeTransactions: Transaction[] = [];

      if (giftCardPayment > 0) {
        stripeTransactions.push(
          this.transactionRepository.create({
            senderId: user.id,
            recipientId: appointments[0].business.owner?.id,
            amount: giftCardPayment,
            type: TransactionType.DEBIT,
            currency: WalletCurrency.USD,
            description: `Gift card portion for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: paymentIntent.id,
            status: TxnStatus.PENDING,
            method: PaymentMethod.GIFTCARD,
            service: 'Booking',
            customerName: `${user.firstName} ${user.surname}`,
          }),
        );
      }

      stripeTransactions.push(
        this.transactionRepository.create({
          senderId: user.id,
          recipientId: appointments[0].business.owner?.id,
          amount: depositChargeBase,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.USD,
          description: depositOnly
            ? `50% deposit (Stripe) for appointment order ${orderId}`
            : `Card payment (Stripe) for appointment order ${orderId}`,
          mode: 'Web',
          referenceId: paymentIntent.id,
          status: TxnStatus.PENDING,
          method: PaymentMethod.STRIPE,
          service: 'Booking',
          customerName: `${user.firstName} ${user.surname}`,
        }),
      );

      if (acquisitionFeeAmount > 0) {
        stripeTransactions.push(
          this.transactionRepository.create({
            senderId: feePayerId,
            amount: acquisitionFeeAmount,
            type: TransactionType.FEE,
            feeSubtype: 'Acquisition',
            currency: WalletCurrency.USD,
            description: `Acquisition fee for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: paymentIntent.id,
            status: TxnStatus.PENDING,
            method: PaymentMethod.STRIPE,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          }),
        );
      }

      if (commissionAmount > 0) {
        stripeTransactions.push(
          this.transactionRepository.create({
            senderId: feePayerId,
            amount: commissionAmount,
            type: TransactionType.FEE,
            feeSubtype: 'Commission',
            currency: WalletCurrency.USD,
            description: `Commission for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: paymentIntent.id,
            status: TxnStatus.PENDING,
            method: PaymentMethod.STRIPE,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          }),
        );
      }

      if (stripePassthroughAmount > 0) {
        stripeTransactions.push(
          this.transactionRepository.create({
            senderId: user.id,
            amount: stripePassthroughAmount,
            type: TransactionType.FEE,
            feeSubtype: 'StripePassthrough',
            currency: WalletCurrency.USD,
            description: `Stripe processing fee passthrough for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: paymentIntent.id,
            status: TxnStatus.PENDING,
            method: PaymentMethod.STRIPE,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          }),
        );
      }

      await this.transactionRepository.save(stripeTransactions);

  

      return {
        message: 'Payment initialized',
        bookingAmount,
        fees: {
          acquisitionFee: acquisitionFeeAmount,
          commission: commissionAmount,
          stripePassthrough: stripePassthroughAmount,
        },
        totalAmount: roundedTotalAmount,
        giftCardAmountUsed: giftCardPayment,
        cardAmountToPay: stripeChargeAmount,
        remainingAtVenue,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Handle card payment (Paystack) - Initialize payment
    const reference = `BKG-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    let paystackInit: { reference: string; authorization_url: string } | null =
      null;

    if (remainingToPay > 0) {
      paystackInit = await this.paystack.initializePayment({
        email: user.email,
        amount: Math.round(remainingToPay * 100), // Convert to kobo
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}customer/salonListing/${appointments[0].business.id}/payment?orderId=${orderId}`,
        metadata: {
          orderId,
          userId: user.id,
          cardId,
          giftCard,
          giftCardAmount: giftCardPayment,
          bookingAmount,
          acquisitionFeeAmount,
          commissionAmount,
          reference,
        },
      });

      if (!paystackInit?.reference) {
        throw new BadRequestException('Unable to initialize payment');
      }
    }

    // Create pending transactions
    const transactions: Transaction[] = [];

    // Transaction for gift card portion
    if (giftCardPayment > 0) {
      const giftCardTx = this.transactionRepository.create({
        senderId: user.id,
        recipientId: appointments[0].business.owner?.id,
        amount: giftCardPayment,
        type: TransactionType.DEBIT,
        currency: WalletCurrency.USD,
        description: `Gift card portion for appointment order ${orderId}`,
        mode: 'Web',
        referenceId: reference,
        status: TxnStatus.PENDING,
        method: PaymentMethod.GIFTCARD,
        service: 'Booking',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(giftCardTx);
    }

    // Transaction for card portion
    if (remainingToPay > 0) {
      const cardTx = this.transactionRepository.create({
        senderId: user.id,
        recipientId: appointments[0].business.owner?.id,
        amount: remainingToPay,
        type: TransactionType.DEBIT,
        currency: WalletCurrency.USD,
        description: `Card payment for appointment order ${orderId}`,
        mode: 'Web',
        referenceId: paystackInit!.reference,
        status: TxnStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Booking',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(cardTx);
    }

    // Transaction for acquisition + commission fees (no Stripe passthrough
    // on Paystack — that's Stripe-specific, Paystack has its own fee
    // structure not addressed by this ticket)
    if (acquisitionFeeAmount > 0) {
      const acqTx = this.transactionRepository.create({
        senderId: feePayerId,
        amount: acquisitionFeeAmount,
        type: TransactionType.FEE,
        feeSubtype: 'Acquisition',
        currency: WalletCurrency.USD,
        description: `Acquisition fee for appointment order ${orderId}`,
        mode: 'Web',
        referenceId: reference,
        status: TxnStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Booking-Fee',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(acqTx);
    }
    if (commissionAmount > 0) {
      const commTx = this.transactionRepository.create({
        senderId: feePayerId,
        amount: commissionAmount,
        type: TransactionType.FEE,
        feeSubtype: 'Commission',
        currency: WalletCurrency.USD,
        description: `Commission for appointment order ${orderId}`,
        mode: 'Web',
        referenceId: reference,
        status: TxnStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Booking-Fee',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(commTx);
    }

    await this.transactionRepository.save(transactions);

    return {
      message: 'Payment initialized',
      bookingAmount,
      fees: { acquisitionFee: acquisitionFeeAmount, commission: commissionAmount },
      totalAmount: roundedTotalAmount,
      giftCardAmountUsed: giftCardPayment,
      cardAmountToPay: remainingToPay,
      authorizationUrl: paystackInit?.authorization_url || null,
      reference: paystackInit?.reference, // Return Paystack reference for completion
      internalReference: reference, // Internal reference for tracking
    };
  }

  // ------------------------------------------------------
  // Step 2 — Complete Booking (Verify Payment & Confirm)
  // ------------------------------------------------------
  async completeBooking(reference: string) {
    // Verify payment with Paystack
    const verification = await this.paystack.verifyPayment(reference);

    if (!verification || verification.status !== 'success') {
      // Update transaction status to failed
      await this.transactionRepository.update(
        { referenceId: reference },
        { status: TxnStatus.FAILED },
      );
      throw new BadRequestException('Payment verification failed');
    }

    const meta = verification.metadata;
    const bookingAmount = Number(meta.bookingAmount) || 0;
    const acquisitionFeeAmount = Number(meta.acquisitionFeeAmount) || 0;
    const commissionAmount = Number(meta.commissionAmount) || 0;
    const feeAmount = acquisitionFeeAmount + commissionAmount;
    const giftCardAmount = Number(meta.giftCardAmount) || 0;
    const orderId = meta.orderId;

    // This callback can be hit again for the same payment (e.g. a page
    // refresh); the salon and KHS were already told the first time.
    const alreadyConfirmed =
      (await this.bookingRepository.count({
        where: { orderId, status: AppointmentStatus.CONFIRMED },
      })) > 0;

    // Start DB transaction
    const result = await this.dataSource.manager.transaction(
      async (manager) => {
        // Find appointments
        const appointments = await manager.find(Appointment, {
          where: { orderId },
          relations: ['business', 'business.owner'],
        });

        if (appointments.length === 0) {
          throw new NotFoundException('Appointments not found');
        }

        // Find user
        const user = await manager.findOne(User, {
          where: { id: meta.userId },
        });
        if (!user) throw new NotFoundException('User not found');

        // Handle gift card portion if any
        if (meta.giftCard && giftCardAmount > 0) {
          const gift = await manager.findOne(BusinessGiftCard, {
            where: { code: meta.giftCard },
          });

          if (!gift) throw new BadRequestException('Gift card not found');

          gift.remainingAmount = Number(gift.remainingAmount) - giftCardAmount;
          if (gift.remainingAmount === 0) {
            gift.status = BusinessGiftCardStatus.USED;
            gift.redeemedAt = new Date();
          }
          await manager.save(BusinessGiftCard, gift);

          // Update gift card transaction to COMPLETED
          await manager.update(
            Transaction,
            {
              referenceId: meta.reference,
              service: 'Booking',
              method: PaymentMethod.GIFTCARD,
            },
            {
              status: TxnStatus.COMPLETED,
            },
          );
        }

        // Update appointments to confirmed
        for (const appointment of appointments) {
          appointment.status = AppointmentStatus.CONFIRMED;
          appointment.paymentStatus = PaymentStatus.PAID;
          this.applyPendingRebookDate(appointment);
        }
        await manager.save(Appointment, appointments);

        // Update card payment transaction to COMPLETED
        await manager.update(
          Transaction,
          {
            referenceId: reference,
            service: 'Booking',
            method: PaymentMethod.PAYSTACK,
          },
          {
            status: TxnStatus.COMPLETED,
          },
        );

        // Update platform fee transaction to COMPLETED
        if (feeAmount > 0) {
          await manager.update(
            Transaction,
            {
              referenceId: meta.reference,
              service: 'Booking-Fee',
            },
            {
              status: TxnStatus.COMPLETED,
            },
          );
        }

        // Save card authorization code if available (for future recurring payments)
        if (meta.cardId && verification.authorization?.authorization_code) {
          await manager.update(
            Card,
            { id: meta.cardId },
            {
              paystackAuthorizationCode:
                verification.authorization.authorization_code,
              paystackEmail: verification.customer?.email,
            },
          );
        }

        return {
          appointments,
          user,
          bookingAmount,
          fees: { acquisitionFee: acquisitionFeeAmount, commission: commissionAmount },
          giftCardAmountUsed: giftCardAmount,
          cardAmountUsed: verification.amount / 100, // Convert from kobo
          totalPaid: verification.amount / 100 + giftCardAmount,
          userEmail: user.email,
          userFirstName: user.firstName,
          shouldSendConfirmationEmail: await this.shouldSendBookingConfirmationEmail(user),
        };
      },
    );

    if (result.userEmail && result.shouldSendConfirmationEmail) {
      const serviceNames = [
        ...new Set(result.appointments.map((a) => a.serviceName)),
      ].join(', ');
      this.emailService.sendBookingConfirmationEmail(
        result.userEmail,
        result.userFirstName || 'Valued Customer',
        result.appointments[0].business?.businessName || 'the salon',
        serviceNames,
        result.appointments[0].date,
        result.appointments[0].time,
      );
    }

    try {
      const firstAppointment = result.appointments[0];
      const serviceNames = [
        ...new Set(result.appointments.map((a) => a.serviceName)),
      ].join(', ');

      await this.notificationService.create({
        userId: meta.userId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking Confirmed',
        message: `Your booking at ${firstAppointment.business?.businessName || 'the salon'} for ${serviceNames} has been confirmed.`,
        link: '/customer/bookings',
        metadata: {
          orderId,
          salonId: firstAppointment.business?.id,
          salonName: firstAppointment.business?.businessName,
        },
      });
    } catch (err) {
      this.logger.error('Failed to create in-app notification for online booking completion:', err);
    }

    try {
      const firstAppointment = result.appointments[0];
      const serviceNames = [...new Set(result.appointments.map((a) => a.serviceName))].join(', ');
      const amountPaid = result.appointments.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      if (!alreadyConfirmed) {
        await this.notifyMerchantOfNewBooking({
          businessId: firstAppointment.business?.id,
          orderId,
          customerId: result.user.id,
          customerName: `${result.user.firstName} ${result.user.surname}`,
          serviceNames,
          date: firstAppointment.date,
          time: firstAppointment.time,
          amountPaid,
        });
        this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));

        // This path had no Slack message; KHS is told about every booking.
        this.slackService.notify(
          `🎉 *New Booking Payment Confirmed (Paystack)*\n` +
          `• *Order ID*: \`${orderId}\`\n` +
          `• *Customer*: ${result.user.firstName || 'Customer'} ${result.user.surname || ''} (${result.user.email})\n` +
          `• *Salon*: ${firstAppointment.business?.businessName || 'the salon'}\n` +
          `• *Services*: ${serviceNames}\n` +
          `• *Appointment*: ${firstAppointment.date} at ${firstAppointment.time}\n` +
          `• *Amount Paid*: $${amountPaid.toFixed(2)}`
        );
      }
    } catch (err) {
      this.logger.error('Failed to send merchant booking notification (Paystack):', err);
    }

    // Add funds to business wallet (outside transaction to avoid deadlock)
    try {
      const businessId = result.appointments[0].business.id;
      const ownerId = result.appointments[0].business.owner?.id;

      if (businessId && ownerId) {
        // Try to get wallet, create if doesn't exist
        try {
          await this.walletService.getWalletByBusinessId(businessId);
        } catch (walletNotFoundError) {
          // Wallet doesn't exist, create it
          await this.walletService.createWalletForBusiness({
            businessId,
            ownerId,
            currency: WalletCurrency.USD,
            description: 'Business wallet - auto-created from booking',
          });
        }

        await this.walletService.addFunds({
          businessId,
          recipientId: ownerId,
          senderId: meta.userId,
          amount: bookingAmount, // Amount credited to business (excluding platform fee)
          type: TransactionType.EARNING,
          description: `Booking payment for order ${orderId}`,
          referenceId: reference,
          currency: WalletCurrency.USD,
          mode: 'Web',
          method: PaymentMethod.PAYSTACK,
        });
      }
    } catch (walletError) {
      // Log the error but don't fail the entire operation since booking was confirmed successfully
      console.error('Failed to add funds to business wallet:', walletError);
      // Customer is already charged via Paystack and the booking is
      // confirmed — if crediting the merchant fails here, the merchant is
      // never paid, with nothing else set up to retry it.
      StructuredSlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Paystack booking wallet credit failed for order ${orderId}`,
        body: `A Paystack-paid booking was confirmed, but crediting the merchant's wallet for it failed — the merchant is not paid.
• Order: ${orderId}
• Reference: ${reference}
• Error: ${walletError instanceof Error ? walletError.message : String(walletError)}`,
      });
    }

    return {
      message: 'Booking confirmed successfully',
      ...result,
    };
  }

  async completeStripeBooking(
    paymentIntentId?: string,
    orderId?: string,
  ): Promise<{ success: boolean; message: string }> {
    let spi: StripePaymentIntent | null = null;
    if (paymentIntentId) {
      spi = await this.stripePaymentIntentRepository.findOne({
        where: { stripePaymentIntentId: paymentIntentId },
      });
    } else if (orderId) {
      spi = await this.stripePaymentIntentRepository.findOne({
        where: { orderId },
        order: { createdAt: 'DESC' },
      });
    }

    if (!spi) {
      throw new NotFoundException('Stripe payment record not found');
    }

    // Retrieve status from Stripe
    const paymentIntent = await this.stripeService.retrievePaymentIntent(
      spi.stripePaymentIntentId,
    );

    if (paymentIntent.status === 'succeeded') {
      await this.handleStripePaymentSucceeded(
        spi.stripePaymentIntentId,
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : null,
      );
      return { success: true, message: 'Booking confirmed successfully' };
    }

    return {
      success: false,
      message: `Payment status is ${paymentIntent.status}`,
    };
  }

  // ------------------------------------------------------
  // Stripe — Handle payment_intent.succeeded webhook
  // ------------------------------------------------------
  // Unlike completeBooking (Paystack), this does NOT credit the business
  // wallet — Stripe-funded bookings stay HELD until the appointment is
  // marked Completed (see BusinessService.completeBooking's release hook).
  async handleStripePaymentSucceeded(
    paymentIntentId: string,
    chargeId?: string | null,
  ): Promise<void> {
    const spi = await this.stripePaymentIntentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!spi) {
      this.logger.warn(
        `No StripePaymentIntent found for ${paymentIntentId} — ignoring webhook`,
      );
      return;
    }

    // Webhooks can be delivered more than once — no-op if already processed.
    if (spi.status !== StripeEscrowStatus.PENDING) {
      return;
    }

    if (chargeId) {
      spi.stripeChargeId = chargeId;
    }

    const orderId = spi.orderId;

    const result = await this.dataSource.manager.transaction(
      async (manager) => {
        const appointments = await manager.find(Appointment, {
          where: { orderId },
          relations: ['business', 'business.owner'],
        });
        if (appointments.length === 0) {
          throw new NotFoundException('Appointments not found');
        }

        const user = await manager.findOne(User, {
          where: { id: spi.userId },
        });
        if (!user) throw new NotFoundException('User not found');

        for (const appointment of appointments) {
          appointment.status = AppointmentStatus.CONFIRMED;
          appointment.paymentStatus = PaymentStatus.PAID;
          this.applyPendingRebookDate(appointment);
        }
        await manager.save(Appointment, appointments);

        await manager.update(
          Transaction,
          { referenceId: paymentIntentId, service: 'Booking' },
          { status: TxnStatus.COMPLETED },
        );
        await manager.update(
          Transaction,
          { referenceId: paymentIntentId, service: 'Booking-Fee' },
          { status: TxnStatus.COMPLETED },
        );

        spi.status = StripeEscrowStatus.HELD;
        spi.heldAt = new Date();
        await manager.save(StripePaymentIntent, spi);

        return {
          appointments,
          user,
          userEmail: user.email,
          userFirstName: user.firstName,
          shouldSendConfirmationEmail:
            await this.shouldSendBookingConfirmationEmail(user),
        };
      },
    );

    const totalAmountPaid = result.appointments.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const serviceNames = [
      ...new Set(result.appointments.map((a) => a.serviceName)),
    ].join(', ');
    const firstAppointment = result.appointments[0];

    // 1. Send customer email with payment details
    if (result.userEmail && result.shouldSendConfirmationEmail) {
      this.emailService.sendBookingConfirmationEmail(
        result.userEmail,
        result.userFirstName || 'Valued Customer',
        firstAppointment.business?.businessName || 'the salon',
        serviceNames,
        firstAppointment.date,
        firstAppointment.time,
        orderId,
        totalAmountPaid,
        'Card (Stripe)',
      );
    }

    // 2. Tell the salon (in-app + email, per its Notifications settings) and KHS.
    await this.notifyMerchantOfNewBooking({
      businessId: firstAppointment.business?.id,
      orderId,
      customerId: result.user.id,
      customerName: `${result.user.firstName} ${result.user.surname}`,
      serviceNames,
      date: firstAppointment.date,
      time: firstAppointment.time,
      amountPaid: totalAmountPaid,
    });
    this.syncIntegrations(() => this.integrationSync.onBookingConfirmed(orderId));

    try {
      const business = firstAppointment.business;

      // 2c. Slack Notification (KHS, always)
      this.slackService.notify(
        `🎉 *New Booking Payment Confirmed (Stripe)*\n` +
        `• *Order ID*: \`${orderId}\`\n` +
        `• *Customer*: ${result.userFirstName || 'Customer'} ${result.user.surname || ''} (${result.userEmail})\n` +
        `• *Salon*: ${business?.businessName || firstAppointment.business?.businessName || 'the salon'}\n` +
        `• *Services*: ${serviceNames}\n` +
        `• *Appointment*: ${firstAppointment.date} at ${firstAppointment.time}\n` +
        `• *Amount Paid*: $${totalAmountPaid.toFixed(2)}`
      );
    } catch (err) {
      this.logger.error('Failed to send merchant or Slack booking notification (Stripe):', err);
    }
  }

  

  // Stripe — Handle payment_intent.payment_failed webhook
  async handleStripePaymentFailed(paymentIntentId: string): Promise<void> {
    const spi = await this.stripePaymentIntentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    await this.stripePaymentIntentRepository.update(
      { stripePaymentIntentId: paymentIntentId },
      { status: StripeEscrowStatus.FAILED },
    );
    await this.transactionRepository.update(
      { referenceId: paymentIntentId },
      { status: TxnStatus.FAILED },
    );

    if (!spi) return;

    this.slackService.notify(
      `❌ *Card Payment Declined*\n` +
      `• *Order ID*: \`${spi.orderId}\`\n` +
      `• *Payment Intent*: \`${paymentIntentId}\`\n` +
      `• *Amount*: $${spi.amount}`,
    );

    const user = await this.userRepository.findOne({ where: { id: spi.userId } });
    if (user?.email) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const message = `Your card payment for order ${spi.orderId} was declined and your booking could not be confirmed. Please try again with a different card.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: 'Kinky Hairstylist',
        subject: 'Your payment could not be processed',
        clientName: user.firstName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(user.email, 'Your payment could not be processed', message, html);
    }
  }

  // Cancellation policy — see cancelBooking. A cancellation at least the
  // merchant's cancellation window before the (earliest) appointment is
  // "early"; inside that window is "late" (treated the same as a no-show,
  // since there's no separate no-show detection today). The window is the
  // merchant's own setting; the early-cancellation fee and the stylist's
  // share of a forfeited amount are platform-wide (admin Platform Settings
  // > Payments), falling back to these defaults if unset.
  private static readonly DEFAULT_EARLY_CANCELLATION_FEE = 10; // flat dollars
  private static readonly DEFAULT_LATE_CANCELLATION_STYLIST_SHARE_PERCENT = 70;

  // This codebase stores appointment date/time as two separate strings —
  // date "2024-01-15", time "2:00 PM" (12-hour, not ISO) — so naively
  // building `new Date(`${date}T${time}`)` silently produces Invalid
  // Date. This mirrors the one existing correct precedent
  // (parseDateTime in integration/services/google-calendar.service.ts).
  private parseAppointmentDateTime(date: string, time: string): Date {
    const [timePart, meridiem] = time.split(' ');
    const [hoursRaw, minutes] = timePart.split(':').map(Number);
    let hours = hoursRaw;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    else if (meridiem === 'AM' && hours === 12) hours = 0;

    const dt = new Date(date);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }

  // Refund policy — early cancellation (outside the merchant's window): the
  // customer gets back the full booking amount minus the flat platform
  // cancellation fee. This
  // REPLACES the earlier acquisition/commission/real-Stripe-fee
  // withholding for this path entirely; it does not stack with it.
  // Returns cents: 0 or negative means nothing left to refund.
  private calculateEarlyCancellationRefundCents(
    spi: StripePaymentIntent,
    cancellationFee: number,
  ): number {
    const bookingAmountCents = Math.round(spi.bookingAmount * 100);
    const feeCents = Math.round(cancellationFee * 100);
    return bookingAmountCents - feeCents;
  }

  // Get User Bookings
  // Appointments are created as PENDING the moment a client picks a date/
  // time, before payment — holding the slot while they go through the
  // payment page. If they never come back to pay, the row would otherwise
  // sit forever looking like a real upcoming booking. Lazily expire any
  // PENDING appointment older than this on every fetch, rather than
  // running a background job for it.
  private static readonly PENDING_EXPIRY_MINUTES = 30;

  private async expireStalePendingBookings(userId: string): Promise<void> {
    const cutoff = new Date(
      Date.now() - BookingService.PENDING_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.bookingRepository
      .createQueryBuilder()
      .update(Appointment)
      .set({
        status: AppointmentStatus.CANCELLED,
        cancellationsNote: 'Payment not completed in time — booking expired',
        cancelledAt: new Date(),
      })
      .where('client_id = :userId', { userId })
      .andWhere('status = :status', { status: AppointmentStatus.PENDING })
      .andWhere('"createdAt" < :cutoff', { cutoff })
      .execute();
  }

  async getUserBookings(userId: string): Promise<Appointment[]> {
    await this.expireStalePendingBookings(userId);

    const appointments = await this.bookingRepository.find({
      where: { client: { id: userId } },
      relations: ['business', 'service', 'staff'],
    });

    const orderIds = [...new Set(appointments.map((a) => a.orderId))];
    const reviewedOrderIds = await this.reviewService.getReviewedOrderIds(orderIds);

    return appointments.map((a) => ({
      ...a,
      hasReview: reviewedOrderIds.has(a.orderId),
    })) as Appointment[];
  }

  // Get Booking by ID
  async getBookingById(orderId: string): Promise<Appointment[]> {
    const whereCondition = this.isUuid(orderId) ? { id: orderId } : { orderId };

    const appointments = await this.bookingRepository.find({
      where: whereCondition,
      relations: [
        'service',
        'service.assignedStaff',
        'staff',
        'business',
        'business.owner',
        'client',
      ],
    });
    if (!appointments || appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    const orderIds = [...new Set(appointments.map((a) => a.orderId))];
    const reviewedOrderIds = await this.reviewService.getReviewedOrderIds(orderIds);

    return appointments.map((a) => ({
      ...a,
      hasReview: reviewedOrderIds.has(a.orderId),
    })) as Appointment[];
  }

  // Cancel Booking
  async cancelBooking(
    orderId: string,
    cancellationsNote?: string,
    acceptedTerms?: boolean,
    serviceIds?: string[],
  ): Promise<{
    message: string;
    cancelledCount: number;
    remainingCount: number;
    // Early cancellation only — mutually exclusive with forfeiture below.
    refund?: {
      amount: number;
      currency: string;
      cancellationFeeWithheld: number;
    };
    // Late cancellation only — no refund happens on this path at all.
    forfeiture?: {
      amount: number;
      currency: string;
      stylistShare: number;
      khsShare: number;
    };
  }> {
    if (!acceptedTerms) {
      throw new BadRequestException(
        'You must accept the cancellation terms to proceed',
      );
    }

    // Find all appointments for this orderId
    const appointments = await this.bookingRepository.find({
      where: { orderId },
      relations: [
        'client',
        'service',
        'business.bookingPolicies',
        'business.ownerSettings',
      ],
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    let appointmentsToCancel: Appointment[];

    if (serviceIds && serviceIds.length > 0) {
      // Cancel only specific services
      appointmentsToCancel = appointments.filter(
        (appt) => appt.service && serviceIds.includes(appt.service.id),
      );

      if (appointmentsToCancel.length === 0) {
        throw new NotFoundException(
          'No appointments found with the specified service IDs',
        );
      }

      // Check if any of the specified appointments are already cancelled
      const alreadyCancelled = appointmentsToCancel.filter(
        (appt) => appt.status === AppointmentStatus.CANCELLED,
      );
      if (alreadyCancelled.length > 0) {
        throw new BadRequestException(
          `${alreadyCancelled.length} of the specified appointment(s) are already cancelled`,
        );
      }
    } else {
      // Cancel all appointments in the booking
      appointmentsToCancel = appointments;

      // Check if all appointments are already cancelled
      const allCancelled = appointmentsToCancel.every(
        (appt) => appt.status === AppointmentStatus.CANCELLED,
      );
      if (allCancelled) {
        throw new BadRequestException('All appointments are already cancelled');
      }

      // Filter out already cancelled appointments
      appointmentsToCancel = appointmentsToCancel.filter(
        (appt) => appt.status !== AppointmentStatus.CANCELLED,
      );
    }

    // Cancellation policy: at least the merchant's window before the
    // *earliest* appointment among the ones being cancelled is "early"
    // (flat platform fee); inside that window is "late" (full forfeiture,
    // split stylist/KHS by the platform share — see the class constants
    // above). Order-level Stripe escrow is one row
    // per order, but appointments are per-service with their own date/
    // time, so the earliest one governs the whole order-level refund.
    let earliestAppointmentDateTime: Date | null = null;
    for (const appt of appointmentsToCancel) {
      const dt = this.parseAppointmentDateTime(appt.date, appt.time);
      if (!isNaN(dt.getTime()) && (!earliestAppointmentDateTime || dt < earliestAppointmentDateTime)) {
        earliestAppointmentDateTime = dt;
      }
    }
    // No parseable date/time at all — don't penalize the customer for a
    // data gap, treat as early (matches the existing fail-open convention
    // used elsewhere in this file for missing data).
    const hoursUntilAppointment = earliestAppointmentDateTime
      ? (earliestAppointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
      : Infinity;
    const cancellationWindowHours = resolveCancellationWindowHours(
      appointments[0].business,
    );
    const isEarlyCancellation = hoursUntilAppointment >= cancellationWindowHours;

    const cancellationPayments = await this.platformSettingsService.getPayments();
    const earlyCancellationFee =
      Number(cancellationPayments.earlyCancellationFee ?? BookingService.DEFAULT_EARLY_CANCELLATION_FEE);
    const lateStylistShare =
      Number(
        cancellationPayments.lateCancellationStylistShare ??
          BookingService.DEFAULT_LATE_CANCELLATION_STYLIST_SHARE_PERCENT,
      ) / 100;

    // Pre-flight: work out the actual refund amount for any Stripe escrow
    // held on this booking BEFORE cancelling anything, for the early-
    // cancellation path only — if that math goes to zero or negative,
    // the whole cancellation is blocked rather than silently refunding
    // nothing. Late cancellation has no such check: the full amount is
    // always forfeited, there's nothing to validate up front.
    const heldPaymentIntents = await this.stripePaymentIntentRepository.find({
      where: { orderId, status: StripeEscrowStatus.HELD },
    });

    const refundPlans: { spi: StripePaymentIntent; refundAmountCents: number }[] = [];
    if (isEarlyCancellation) {
      for (const spi of heldPaymentIntents) {
        const refundAmountCents = this.calculateEarlyCancellationRefundCents(spi, earlyCancellationFee);
        if (refundAmountCents <= 0) {
          throw new BadRequestException(
            `Cannot cancel: after the $${earlyCancellationFee} cancellation fee, no refundable amount remains for order ${orderId}. Contact an admin to review.`,
          );
        }
        refundPlans.push({ spi, refundAmountCents });
      }
    }

    // Update status and add cancellation note. paymentStatus is reset to
    // UNPAID here too — any money that was actually collected has either
    // been refunded (Stripe) or was never charged (pay-at-venue), so a
    // stale PAID flag must not survive a cancellation. This is also what
    // makes restoreBooking's Pending/Unpaid restore below meaningful: a
    // cancelled appointment restored later needs to go through real
    // payment again, not silently re-appear as already paid.
    // A booking still Pending was never confirmed or paid (e.g. the client left
    // the payment page), so the salon and KHS never heard of it and are not
    // told it was cancelled.
    const salonWasTold = appointmentsToCancel.some(
      (a) => a.status !== AppointmentStatus.PENDING,
    );

    const cancelledAt = new Date();
    for (const appointment of appointmentsToCancel) {
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.paymentStatus = PaymentStatus.UNPAID;
      appointment.cancelledAt = cancelledAt;
      if (cancellationsNote) {
        appointment.cancellationsNote = cancellationsNote;
      }
    }

    await this.bookingRepository.save(appointmentsToCancel);

    const firstAppt = appointmentsToCancel[0];

    // Refund/forfeiture of any Stripe escrow held for this booking — a
    // no-op for Paystack/gift-card/cash appointments, which have no
    // StripePaymentIntent row (pre-existing gap, not addressed here).
    let refundSummary:
      | { amount: number; currency: string; cancellationFeeWithheld: number }
      | undefined;
    let forfeitureSummary:
      | { amount: number; currency: string; stylistShare: number; khsShare: number }
      | undefined;

    if (isEarlyCancellation) {
      try {
        for (const { spi, refundAmountCents } of refundPlans) {
          const stripeRefund = await this.stripeService.createRefund({
            paymentIntentId: spi.stripePaymentIntentId,
            amount: refundAmountCents,
          });

          spi.status = StripeEscrowStatus.REFUNDED;
          spi.refundedAt = new Date();
          await this.stripePaymentIntentRepository.save(spi);

          const bookingAmountCents = Math.round(spi.bookingAmount * 100);
          const feeCents = bookingAmountCents - refundAmountCents;

          refundSummary = {
            amount: refundAmountCents / 100,
            currency: spi.currency.toUpperCase(),
            cancellationFeeWithheld: feeCents / 100,
          };

          const debitTx = await this.transactionRepository.findOne({
            where: {
              referenceId: spi.stripePaymentIntentId,
              service: 'Booking',
              method: PaymentMethod.STRIPE,
            },
          });

          if (debitTx) {
            await this.refundRepository.save(
              this.refundRepository.create({
                transactionId: debitTx.id,
                userId: spi.userId,
                amount: refundAmountCents / 100,
                currency: spi.currency.toUpperCase(),
                reason: cancellationsNote || 'Booking cancelled before completion',
                adminNote: `Stripe refund ${stripeRefund.id} ($${earlyCancellationFee} cancellation fee withheld)`,
                status: RefundStatus.PROCESSED,
                refundMethod: RefundMethod.CARD_REFUND,
              }),
            );
          }
        }

        if (refundSummary) {
          this.slackService.notify(
            `↩️ *Booking Cancellation Refunded*\n` +
            `• *Order ID*: \`${orderId}\`\n` +
            `• *Refunded*: $${refundSummary.amount.toFixed(2)} ${refundSummary.currency}\n` +
            `• *Cancellation Fee Withheld*: $${refundSummary.cancellationFeeWithheld.toFixed(2)}`,
          );
        }
      } catch (refundError) {
        this.logger.error(
          `Failed to refund Stripe escrow for order ${orderId}: ${refundError.message}`,
          refundError.stack,
        );
        // The appointment is already saved CANCELLED above (:1868) — if the
        // Stripe refund itself failed, the customer's money is now stranded
        // with no automatic retry, so this needs a human, not just a log line.
        StructuredSlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.STRIPE,
          severity: SlackSeverity.CRITICAL,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Cancellation refund failed for order ${orderId}`,
          body: `A booking was cancelled and marked as such, but the Stripe refund failed — the customer's money is stranded, not automatically retried.
• Order: ${orderId}
• Error: ${refundError instanceof Error ? refundError.message : String(refundError)}`,
        });
      }
    } else {
      // Late cancellation (inside the merchant's window) — no refund at all. No
      // deposit concept exists yet, so the full amount already collected
      // plays the role a deposit would once deposits ship: forfeited,
      // split stylist/KHS by the platform share, mirroring completeBooking's own escrow-
      // release-to-wallet mechanism (src/business/services/business.service.ts)
      // exactly, just at the stylist's share instead of 100%.
      try {
        for (const spi of heldPaymentIntents) {
          const businessId = firstAppt?.business?.id;
          // `ownerId` is a direct column, always populated; `.owner` is a
          // non-eager relation that's frequently absent unless explicitly
          // requested — prefer the column (see finding logged separately:
          // several pre-existing call sites in this file rely on
          // `.owner?.id` alone, which silently no-ops when unset).
          const ownerId = firstAppt?.business?.ownerId || firstAppt?.business?.owner?.id;
          if (!businessId || !ownerId) continue;

          const stylistShareAmount =
            Math.round(spi.bookingAmount * lateStylistShare * 100) / 100;
          const khsShareAmount = Math.round((spi.bookingAmount - stylistShareAmount) * 100) / 100;

          try {
            await this.walletService.getWalletByBusinessId(businessId);
          } catch {
            await this.walletService.createWalletForBusiness({
              businessId,
              ownerId,
              currency: WalletCurrency.USD,
              description: 'Business wallet - auto-created from late-cancellation forfeiture',
            });
          }

          await this.walletService.addFunds({
            businessId,
            recipientId: ownerId,
            senderId: spi.userId,
            amount: stylistShareAmount,
            type: TransactionType.EARNING,
            description: `Late-cancellation forfeiture payout for order ${orderId}`,
            referenceId: spi.stripePaymentIntentId,
            currency: WalletCurrency.USD,
            mode: 'Web',
            method: PaymentMethod.STRIPE,
          });

          await this.transactionRepository.save(
            this.transactionRepository.create({
              senderId: spi.userId,
              amount: khsShareAmount,
              type: TransactionType.FEE,
              feeSubtype: 'LateCancellationForfeiture',
              currency: WalletCurrency.USD,
              description: `KHS share of late-cancellation forfeiture for order ${orderId}`,
              mode: 'Web',
              referenceId: orderId,
              status: TxnStatus.COMPLETED,
              method: PaymentMethod.STRIPE,
              service: 'Booking-Fee',
              customerName: `${firstAppt?.client?.firstName ?? ''} ${firstAppt?.client?.surname ?? ''}`.trim(),
            }),
          );

          spi.status = StripeEscrowStatus.RELEASED;
          spi.releasedAt = new Date();
          await this.stripePaymentIntentRepository.save(spi);

          forfeitureSummary = {
            amount: spi.bookingAmount,
            currency: spi.currency.toUpperCase(),
            stylistShare: stylistShareAmount,
            khsShare: khsShareAmount,
          };
        }

        if (forfeitureSummary) {
          StructuredSlackService.notify({
            node: SlackNode.PAYMENT,
            provider: SlackProvider.STRIPE,
            severity: SlackSeverity.INFO,
            type: SlackEventType.PAYMENT_SUCCESS,
            trigger: `Late-cancellation forfeiture for order ${orderId}`,
            body: `A late cancellation forfeited the full amount already paid, split ${Math.round(lateStylistShare * 100)}/${100 - Math.round(lateStylistShare * 100)} stylist/KHS.
• Order: ${orderId}
• Total forfeited: $${forfeitureSummary.amount} ${forfeitureSummary.currency}
• Stylist share: $${forfeitureSummary.stylistShare}
• KHS share: $${forfeitureSummary.khsShare}`,
          });
        }
      } catch (forfeitureError) {
        this.logger.error(
          `Failed to process late-cancellation forfeiture for order ${orderId}: ${forfeitureError.message}`,
          forfeitureError.stack,
        );
        // Escrow stays HELD forever if this fails — the business is never
        // credited its share and KHS's fee row is never written, with
        // nothing else in the system positioned to retry it.
        StructuredSlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.STRIPE,
          severity: SlackSeverity.CRITICAL,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Late-cancellation forfeiture failed for order ${orderId}`,
          body: `A late cancellation was processed, but crediting the stylist's forfeiture share and recording KHS's fee failed — Stripe escrow is left HELD indefinitely with no automatic retry.
• Order: ${orderId}
• Error: ${forfeitureError instanceof Error ? forfeitureError.message : String(forfeitureError)}`,
        });
      }
    }
    // No "your appointment was cancelled" email (which also copies KHS) for a
    // checkout the client abandoned before it was ever confirmed.
    if (salonWasTold && firstAppt?.client?.email) {
      const serviceNames = [
        ...new Set(appointmentsToCancel.map((a) => a.serviceName)),
      ].join(', ');
      let moneyNote: string | undefined;
      if (refundSummary) {
        moneyNote = `A refund of $${refundSummary.amount.toFixed(2)} ${refundSummary.currency} has been issued to your original payment method${refundSummary.cancellationFeeWithheld > 0 ? ` ($${refundSummary.cancellationFeeWithheld.toFixed(2)} cancellation fee withheld)` : ''}.`;
      } else if (forfeitureSummary) {
        moneyNote = `As this cancellation was made within ${cancellationWindowHours} hours of the appointment, the $${forfeitureSummary.amount.toFixed(2)} ${forfeitureSummary.currency} already paid is non-refundable per our late-cancellation policy.`;
      }
      this.emailService.sendCancellationConfirmationEmail(
        firstAppt.client.email,
        firstAppt.client.firstName || 'Valued Customer',
        firstAppt.business?.businessName || 'the salon',
        serviceNames,
        firstAppt.date,
        firstAppt.time,
        moneyNote,
      );
    }

    try {
      if (firstAppt?.client?.id) {
        const serviceNames = [
          ...new Set(appointmentsToCancel.map((a) => a.serviceName)),
        ].join(', ');
        await this.notificationService.create({
          userId: firstAppt.client.id,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'Booking Cancelled',
          message: `Your booking for ${serviceNames} has been cancelled.`,
          link: '/customer/bookings',
          metadata: {
            orderId,
            cancelledCount: appointmentsToCancel.length,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to create in-app notification for booking cancellation:', err);
    }

    // Tell the salon (per its Notifications settings) and KHS. The Slack
    // message for a refund or forfeiture is sent above; only cancellations
    // where no money moved need one here.
    const cancelledServiceNames = [
      ...new Set(appointmentsToCancel.map((a) => a.serviceName)),
    ].join(', ');
    const clientName =
      `${firstAppt?.client?.firstName ?? ''} ${firstAppt?.client?.surname ?? ''}`.trim() ||
      'A client';
    let merchantMoneyNote: string | undefined;
    if (refundSummary) {
      merchantMoneyNote = `The client was refunded $${refundSummary.amount.toFixed(2)} ${refundSummary.currency}${refundSummary.cancellationFeeWithheld > 0 ? ` after a $${refundSummary.cancellationFeeWithheld.toFixed(2)} cancellation fee` : ''}.`;
    } else if (forfeitureSummary) {
      merchantMoneyNote = `This was inside your ${cancellationWindowHours}-hour cancellation window, so the $${forfeitureSummary.amount.toFixed(2)} ${forfeitureSummary.currency} paid is not refunded. Your share is $${forfeitureSummary.stylistShare.toFixed(2)}.`;
    }
    this.syncIntegrations(() =>
      this.integrationSync.onBookingCancelled(appointmentsToCancel.map((a) => a.id)),
    );
    if (salonWasTold) await this.notifyMerchantOfCancellation({
      businessId: firstAppt?.business?.id,
      orderId,
      customerId: firstAppt?.client?.id ?? '',
      customerName: clientName,
      serviceNames: cancelledServiceNames,
      date: firstAppt?.date ?? '',
      time: firstAppt?.time ?? '',
      moneyNote: merchantMoneyNote,
    });
    if (salonWasTold && !refundSummary && !forfeitureSummary) {
      this.slackService.notify(
        `🚫 *Booking Cancelled*\n` +
        `• *Order ID*: \`${orderId}\`\n` +
        `• *Customer*: ${clientName}${firstAppt?.client?.email ? ` (${firstAppt.client.email})` : ''}\n` +
        `• *Salon*: ${firstAppt?.business?.businessName || 'the salon'}\n` +
        `• *Services*: ${cancelledServiceNames}\n` +
        `• *Was scheduled for*: ${firstAppt?.date} at ${firstAppt?.time}`,
      );
    }

    const remainingCount = appointments.filter(
      (appt) => appt.status !== AppointmentStatus.CANCELLED,
    ).length;

    return {
      message: `${appointmentsToCancel.length} appointment(s) cancelled successfully`,
      cancelledCount: appointmentsToCancel.length,
      remainingCount,
      refund: refundSummary,
      forfeiture: forfeitureSummary,
    };
  }

  // Restore-eligibility check for a Cancelled booking on its original
  // date/time (no reschedule). This does NOT change status/paymentStatus —
  // a cancelled appointment must not look "un-cancelled" until the customer
  // actually pays again. confirmBooking (pay-at-venue/gift-card) or the
  // Stripe webhook (handleStripePaymentSucceeded) are the only places that
  // flip status back, once payment genuinely succeeds. If the customer
  // abandons the payment page after this call, nothing was ever changed —
  // the appointment simply stays Cancelled, exactly as if Restore was never
  // clicked.
  private static readonly RESTORE_CUTOFF_HOURS = 24;

  async restoreBooking(
    orderId: string,
  ): Promise<{ message: string; requiresPayment: boolean }> {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId },
      relations: ['client'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status !== AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'Appointment is not cancelled, cannot restore',
      );
    }

    // Restoring onto the same date/time only makes sense if that date/time
    // is still far enough out — a same-day-tomorrow slot may already be
    // unavailable/re-booked by someone else. Rebook (which picks a new
    // date/time) is the correct path once this close; Restore is not.
    // (Was previously `new Date(`${date}T${time}`)`, which silently
    // produced Invalid Date since `time` is "2:00 PM"-style, not ISO —
    // this check never actually fired. parseAppointmentDateTime handles
    // the real format correctly.)
    const appointmentDateTime = this.parseAppointmentDateTime(
      appointment.date,
      appointment.time,
    );
    const hoursUntilAppointment =
      (appointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < BookingService.RESTORE_CUTOFF_HOURS) {
      throw new BadRequestException(
        `This appointment is too close to its original date/time to restore directly. Use Rebook to pick a new date instead.`,
      );
    }

    return {
      message: 'Appointment is eligible to restore — proceed to payment',
      requiresPayment: true,
    };
  }

  // Client confirms their own intent to attend
  async confirmAvailability(
    orderId: string,
    user: User,
  ): Promise<{ message: string; clientConfirmedAt: Date }> {
    const whereCondition = this.isUuid(orderId)
      ? { id: orderId, client: { id: user.id } }
      : { orderId, client: { id: user.id } };

    const appointments = await this.bookingRepository.find({
      where: whereCondition,
      relations: ['business', 'business.owner', 'client', 'service'],
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    const clientConfirmedAt = new Date();
    for (const appointment of appointments) {
      appointment.clientConfirmedAt = clientConfirmedAt;
    }
    await this.bookingRepository.save(appointments);

    const firstAppointment = appointments[0];
    const merchant = firstAppointment.business?.owner;
    const merchantId = merchant?.id || firstAppointment.business?.ownerId;
    const merchantEmail = merchant?.email || (firstAppointment.business as any)?.ownerEmail;
    const merchantName = merchant?.firstName
      ? `${merchant.firstName} ${merchant.surname || ''}`.trim()
      : 'Salon Owner';
    const clientName = `${user.firstName || ''} ${user.surname || ''}`.trim() || 'Client';
    const serviceNames = [
      ...new Set(appointments.map((a) => a.serviceName || a.service?.name || 'Service')),
    ].join(', ');
    const businessName = firstAppointment.business?.businessName || 'the salon';

    // 1. Send in-app notification to merchant
    if (merchantId) {
      try {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.SYSTEM,
          title: 'Client Confirmed Availability',
          message: `${clientName} has confirmed their availability for appointment ${firstAppointment.orderId || orderId} (${serviceNames}) on ${firstAppointment.date} at ${firstAppointment.time}.`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId: firstAppointment.orderId || orderId,
            salonId: firstAppointment.business?.id,
            customerId: user.id,
          },
        });
      } catch (err) {
        this.logger.error('Failed to send merchant availability in-app notification:', err);
      }
    }

    // 2. Send email notification to merchant
    if (merchantEmail) {
      try {
        this.emailService.sendMerchantAvailabilityConfirmedEmail(
          merchantEmail,
          merchantName,
          clientName,
          businessName,
          serviceNames,
          firstAppointment.date,
          firstAppointment.time,
          firstAppointment.orderId || orderId,
        );
      } catch (err) {
        this.logger.error('Failed to send merchant availability email:', err);
      }
    }

    return { message: 'Availability confirmed', clientConfirmedAt };
  }

  // Reschedule Booking
  async rescheduleBooking(
    orderId: string,
    newDate: Date,
    newTime: string,
    timezoneOffsetMinutes?: number,
  ): Promise<{ message: string; requiresPayment: boolean }> {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId },
      relations: ['client'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!newTime) {
      throw new BadRequestException('A time must be selected');
    }
    const requestedDateTime = this.parseAppointmentDateTime(
      newDate.toISOString().split('T')[0],
      newTime,
    );
    if (isNaN(requestedDateTime.getTime()) || requestedDateTime <= new Date()) {
      throw new BadRequestException(
        'Cannot reschedule to a past date/time',
      );
    }

    // Moving an appointment is a booking too: the salon's lead time, advance
    // limit, same-day cutoff, buffer and double-booking rules all apply.
    const salon = await this.businessRepository.findOne({
      where: { id: appointment.business.id },
      relations: ['bookingPolicies', 'ownerSettings'],
    });
    if (salon) {
      await this.assertBookingAllowedByRules(
        salon,
        newDate.toISOString().split('T')[0],
        newTime,
        parseDurationToMinutes(appointment.duration),
        timezoneOffsetMinutes,
        orderId,
      );
    }

    // Rebooking a previously-cancelled appointment onto a new date must go
    // through real payment again — any earlier payment was already
    // refunded (Stripe) or never taken (pay-at-venue) at cancellation
    // time. Rescheduling an already-paid, still-active appointment to a
    // different time is a separate case and must NOT touch payment status
    // — the customer already paid, moving the date doesn't un-pay them.
    const isRebookOfCancelled =
      appointment.status === AppointmentStatus.CANCELLED;

    const formattedDate = newDate.toISOString().split('T')[0];

    if (isRebookOfCancelled) {
      // Stage the new date/time only — the appointment stays exactly as it
      // was (Cancelled, original date/time) until payment actually
      // succeeds. confirmBooking/handleStripePaymentSucceeded promote
      // these into date/time and flip status once payment completes. If
      // the customer abandons the payment page, nothing here was ever
      // changed.
      appointment.pendingRebookDate = formattedDate;
      appointment.pendingRebookTime = newTime;
      await this.bookingRepository.save(appointment);

      return {
        message: 'New date selected — proceed to payment to confirm',
        requiresPayment: true,
      };
    }

    appointment.date = formattedDate;
    appointment.time = newTime;
    appointment.status = AppointmentStatus.RESCHEDULED;
    await this.bookingRepository.save(appointment);
    this.syncIntegrations(() =>
      this.integrationSync.onBookingRescheduled(appointment.id),
    );

    if (appointment.client?.email) {
      this.emailService.sendRescheduleConfirmationEmail(
        appointment.client.email,
        appointment.client.firstName || 'Valued Customer',
        appointment.business?.businessName || 'the salon',
        appointment.serviceName,
        formattedDate,
        newTime,
      );
    }

    return {
      message: 'Appointment rescheduled successfully',
      requiresPayment: false,
    };
  }

  // Get Booking Fees — read-only preview of what confirmBooking would
  // charge. Deliberately does NOT perform the atomic acquisition-fee claim
  // (that only happens for real inside confirmBooking) — this just checks
  // whether a claim row already exists, so repeatedly viewing this preview
  // can never itself consume a client's one-time acquisition-fee status.
  async getBookingFees(
    businessId?: string,
    clientId?: string,
  ): Promise<{
    acquisitionFeeRate: number | null;
    commissionRate: number;
    stripePassthroughRate: number;
    stripePassthroughFixedFee: number;
    allowDepositPayment: boolean;
    cancellationWindowHours: number;
  }> {
    const payments = await this.platformSettingsService.getPayments();
    const commissionRate = Number(payments.commissionRate) || 0;
    const stripePassthroughRate = Number(payments.stripePassthroughRate) || 0;
    const stripePassthroughFixedFee = Number(payments.stripePassthroughFixedFee) || 0;

    if (!businessId) {
      return {
        acquisitionFeeRate: null,
        commissionRate,
        stripePassthroughRate,
        stripePassthroughFixedFee,
        allowDepositPayment: true,
        cancellationWindowHours: DEFAULT_CANCELLATION_WINDOW_HOURS,
      };
    }

    const business = await this.businessRepository.findOne({
      where: { id: businessId },
      relations: ['ownerSettings', 'bookingPolicies'],
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    let acquisitionFeeRate: number | null = null;
    if (clientId) {
      const existingClaim = await this.businessClientAcquisitionRepository.findOne({
        where: { businessId, clientId },
      });
      acquisitionFeeRate = existingClaim
        ? 0
        : Number(payments.acquisitionFeeTiers?.[business.planTier]) || 0;
    }

    return {
      acquisitionFeeRate,
      commissionRate,
      stripePassthroughRate,
      stripePassthroughFixedFee,
      allowDepositPayment:
        business.ownerSettings?.pricingPolicies?.allowDepositPayment !== false,
      cancellationWindowHours: resolveCancellationWindowHours(business),
    };
  }

  // Rate Business
  async rateBusiness(
    orderId: string,
    rating: number,
    comment: string,
    user: User,
  ) {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId, client: { id: user.id } },
      relations: ['business', 'business.owner'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const business = appointment.business;

    let client = await this.clientRepository.findOne({
      where: { email: user.email, ownerId: business.owner.id },
    });

    if (!client) {
      client = await this.clientRepository.save({
        firstName: user.firstName,
        lastName: user.surname,
        email: user.email,
        phone: user.phoneNumber,
        phoneCode: '',
        clientType: ClientType.REGULAR,
        ownerId: business.owner.id,
        owner: business.owner,
        isActive: true,
      } as any);
    }

    const reviewPayload = {
      clientId: client!.id,
      ownerId: business.owner.id,
      businessId: business.id,
      orderId: appointment.orderId,
      // Auto-attributed to whichever staff member worked this appointment
      // — Review had no link to Staff at all before this, so a per-staff
      // rating could never be computed. Appointment.staff is a
      // many-to-many (eager) but a booking is almost always one staff
      // member in practice; null if none was assigned.
      staffId: appointment.staff?.[0]?.id ?? null,
      rating,
      comment,
      service: appointment.serviceName,
      clientName: `${user.firstName} ${user.surname}`,
      clientProfileImage: user.avatarUrl,
      clientType: ClientType.REGULAR,
    };

    return this.reviewService.createReview(reviewPayload);
  }
}
