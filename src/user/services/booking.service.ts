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
import { EmailService } from 'src/email/email.service';
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
import { Card } from 'src/all_user_entities/card.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { User } from 'src/all_user_entities/user.entity';
import { ReviewService } from 'src/business/services/review.service';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { ClientSchema, ClientType } from 'src/business/entities/client.entity';

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
    private platformSettingsService: PlatformSettingsService,
    private reviewService: ReviewService,
    private readonly dataSource: DataSource,
    private readonly paystack: PaystackService,
    private readonly stripeService: StripeService,
    private readonly walletService: BusinessWalletService,
    private readonly emailService: EmailService,
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  // Booking confirmation emails should only be sent if the customer hasn't
  // turned them off in Settings — defaults to true (matches the entity's
  // column default) if they've never saved a preference.
  private async shouldSendBookingConfirmationEmail(user: User): Promise<boolean> {
    const settings = await this.notificationSettingsService.getSettings(user);
    return settings.emailBookingConfirmations;
  }

  // Create Booking
  async createBooking(
    createBookingDto: any,
    user: User,
  ): Promise<{ orderId: string; appointments: Appointment[] }> {
    // Get business
    const business = await this.businessRepository.findOne({
      where: { id: createBookingDto.salonId },
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
      // fall back to minPrice (then maxPrice, then 0). Final amount for
      // variable services is settled during confirmBooking / at venue.
      const bookingAmount =
        service.price ?? service.minPrice ?? service.maxPrice ?? 0;

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

    // Save appointments
    await this.bookingRepository.save(appointments);

    return { orderId, appointments };
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
    const { orderId, payAtVenue, cardId, giftCard, paymentProvider } =
      confirmBookingDto;

    // Find all appointments for this orderId
    const appointments = await this.bookingRepository.find({
      where: { orderId, client: { id: user.id } },
      relations: ['business', 'business.owner'],
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    if (
      appointments.some(
        (appointment) => appointment.status === AppointmentStatus.CONFIRMED,
      )
    ) {
      throw new BadRequestException('Booking is already confirmed');
    }

    // Get platform fee percentage
    const paymentsSettings = await this.platformSettingsService.getPayments();
    const platformFeePercent = Number(paymentsSettings.platformFee) || 0;

    // Calculate amounts
    const bookingAmount = appointments.reduce(
      (sum, appt) => sum + Number(appt.amount),
      0,
    );
    const feeAmount = bookingAmount * (platformFeePercent / 100);
    const totalAmount = bookingAmount + feeAmount;

    // Round to 2 decimal places
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Handle gift card payment if provided
    let giftCardPayment = 0;
    let remainingToPay = roundedTotalAmount;

    if (giftCard) {
      const gift = await this.giftCardRepository.findOne({
        where: { code: giftCard },
      });

      if (!gift) throw new BadRequestException('Gift card not found');
      if (gift.status !== BusinessGiftCardStatus.ACTIVE)
        throw new BadRequestException('Gift card is not active');
      if (gift.remainingAmount <= 0)
        throw new BadRequestException('Gift card has no balance');

      giftCardPayment = Math.min(
        Number(gift.remainingAmount),
        roundedTotalAmount,
      );
      remainingToPay = roundedTotalAmount - giftCardPayment;

      // Round to avoid floating point precision issues
      remainingToPay = Math.round(remainingToPay * 100) / 100;
    }

    // Handle full gift card payment (no card needed) - check this FIRST
    if (remainingToPay <= 0) {
      return await this.dataSource.manager.transaction(async (manager) => {
        const gift = await manager.findOne(BusinessGiftCard, {
          where: { code: giftCard },
        });
        if (!gift || Number(gift.remainingAmount) < totalAmount) {
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

        // Create platform fee transaction
        if (feeAmount > 0) {
          const feeTx = manager.create(Transaction, {
            senderId: user.id,
            amount: feeAmount,
            type: TransactionType.FEE,
            currency: WalletCurrency.USD,
            description: `Platform fee for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.COMPLETED,
            method: PaymentMethod.GIFTCARD,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          });
          await manager.save(Transaction, feeTx);
        }

        // Add funds to business wallet for gift card payment
        try {
          const businessId = appointments[0].business.id;
          const ownerId = appointments[0].business.owner?.id;

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
              senderId: user.id,
              amount: bookingAmount, // Amount credited to business (excluding platform fee)
              type: TransactionType.EARNING,
              description: `Gift card booking payment for order ${orderId}`,
              referenceId: orderId,
              currency: WalletCurrency.USD,
              mode: 'Web',
              method: PaymentMethod.GIFTCARD,
            });
          }
        } catch (walletError) {
          console.error('Failed to add funds to business wallet:', walletError);
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

        return {
          message: 'Booking confirmed successfully with gift card',
          bookingAmount,
          platformFee: feeAmount,
          totalAmount,
          giftCardAmountUsed: totalAmount,
          success: true,
        };
      });
    }

    // Handle pay at venue - no online payment needed
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

        // Create platform fee transaction
        if (feeAmount > 0) {
          const feeTx = manager.create(Transaction, {
            senderId: user.id,
            amount: feeAmount,
            type: TransactionType.FEE,
            currency: WalletCurrency.USD,
            description: `Platform fee for appointment order ${orderId}`,
            mode: 'Web',
            referenceId: orderId,
            status: TxnStatus.PENDING,
            method: PaymentMethod.CASH,
            service: 'Booking-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          });
          await manager.save(Transaction, feeTx);
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

          // ADD MERCHANT NOTIFICATION HERE
    try {
      const firstAppointment = appointments[0];
      const merchantId = firstAppointment.business?.ownerId || firstAppointment.business?.owner?.id;
      const serviceNames = [...new Set(appointments.map((a) => a.serviceName))].join(', ');
      if (merchantId) {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.BOOKING_CONFIRMED,
          title: 'New Booking Confirmed',
          message: `A new booking has been placed by ${user.firstName} ${user.surname} for ${serviceNames}.`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId,
            salonId: firstAppointment.business?.id,
            customerId: user.id,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to send merchant booking notification (Stripe):', err);
    }

        return {
          message: 'Booking confirmed. Payment will be collected at venue.',
          user,
          bookingAmount,
          platformFee: feeAmount,
          totalAmount: roundedTotalAmount,
          giftCardAmountUsed: giftCardPayment,
          payAtVenueAmount: remainingToPay + payAtVenueSurcharge,
          success: true,
        };
      });
    }

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
      const paymentIntent = await this.stripeService.createPaymentIntent({
        amount: Math.round(remainingToPay * 100), // Convert to cents
        currency: 'usd',
        customerEmail: user.email,
        metadata: {
          orderId,
          userId: user.id,
          businessId,
          bookingAmount,
          feeAmount,
        },
      });

      const stripePaymentIntent = this.stripePaymentIntentRepository.create({
        orderId,
        businessId,
        userId: user.id,
        stripePaymentIntentId: paymentIntent.id,
        amount: remainingToPay,
        currency: 'usd',
        bookingAmount,
        feeAmount,
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
          amount: remainingToPay,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.USD,
          description: `Card payment (Stripe) for appointment order ${orderId}`,
          mode: 'Web',
          referenceId: paymentIntent.id,
          status: TxnStatus.PENDING,
          method: PaymentMethod.STRIPE,
          service: 'Booking',
          customerName: `${user.firstName} ${user.surname}`,
        }),
      );

      if (feeAmount > 0) {
        stripeTransactions.push(
          this.transactionRepository.create({
            senderId: user.id,
            amount: feeAmount,
            type: TransactionType.FEE,
            currency: WalletCurrency.USD,
            description: `Platform fee for appointment order ${orderId}`,
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
        platformFee: feeAmount,
        totalAmount: roundedTotalAmount,
        giftCardAmountUsed: giftCardPayment,
        cardAmountToPay: remainingToPay,
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
          feeAmount,
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

    // Transaction for platform fee
    if (feeAmount > 0) {
      const feeTx = this.transactionRepository.create({
        senderId: user.id,
        amount: feeAmount,
        type: TransactionType.FEE,
        currency: WalletCurrency.USD,
        description: `Platform fee for appointment order ${orderId}`,
        mode: 'Web',
        referenceId: reference,
        status: TxnStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Booking-Fee',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(feeTx);
    }

    await this.transactionRepository.save(transactions);

    return {
      message: 'Payment initialized',
      bookingAmount,
      platformFee: feeAmount,
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
    const feeAmount = Number(meta.feeAmount) || 0;
    const giftCardAmount = Number(meta.giftCardAmount) || 0;
    const orderId = meta.orderId;

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
          platformFee: feeAmount,
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

      // ADD MERCHANT NOTIFICATION HERE
    try {
      const firstAppointment = result.appointments[0];
      const merchantId = firstAppointment.business?.ownerId || firstAppointment.business?.owner?.id;
      const serviceNames = [...new Set(result.appointments.map((a) => a.serviceName))].join(', ');
      if (merchantId) {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.BOOKING_CONFIRMED,
          title: 'New Booking Confirmed',
          message: `A new booking has been placed by ${result.user.firstName} ${result.user.surname} for ${serviceNames}.`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId,
            salonId: firstAppointment.business?.id,
            customerId: result.user.id,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to send merchant booking notification (Stripe):', err);
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
    }

    return {
      message: 'Booking confirmed successfully',
      ...result,
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

      // ADD MERCHANT NOTIFICATION HERE
    try {
      const firstAppointment = result.appointments[0];
      const merchantId = firstAppointment.business?.ownerId || firstAppointment.business?.owner?.id;
      const serviceNames = [...new Set(result.appointments.map((a) => a.serviceName))].join(', ');
      if (merchantId) {
        await this.notificationService.create({
          userId: merchantId,
          type: NotificationType.BOOKING_CONFIRMED,
          title: 'New Booking Confirmed',
          message: `A new booking has been placed by ${result.user.firstName} ${result.user.surname} for ${serviceNames}.`,
          link: '/merchant/dashboard/appointments',
          metadata: {
            orderId,
            salonId: firstAppointment.business?.id,
            customerId: result.user.id,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to send merchant booking notification (Stripe):', err);
    }
  }

  

  // Stripe — Handle payment_intent.payment_failed webhook
  async handleStripePaymentFailed(paymentIntentId: string): Promise<void> {
    await this.stripePaymentIntentRepository.update(
      { stripePaymentIntentId: paymentIntentId },
      { status: StripeEscrowStatus.FAILED },
    );
    await this.transactionRepository.update(
      { referenceId: paymentIntentId },
      { status: TxnStatus.FAILED },
    );
  }

  // Refund policy: the customer gets back the service amount minus KHS's
  // own platform fee minus Stripe's real processing fee for that specific
  // charge (looked up from Stripe, not estimated — the exact rate varies
  // by card type/country). Returns the refundable amount in cents: 0 or
  // negative means there's nothing left to refund after those deductions.
  private async calculateStripeRefundAmountCents(
    spi: StripePaymentIntent,
  ): Promise<number> {
    if (!spi.stripeChargeId) {
      throw new BadRequestException(
        `Stripe charge ID missing for payment intent ${spi.stripePaymentIntentId} — cannot compute refund`,
      );
    }

    const stripeFeeCents = await this.stripeService.getChargeFee(
      spi.stripeChargeId,
    );
    const bookingAmountCents = Math.round(spi.bookingAmount * 100);
    const platformFeeCents = Math.round(spi.feeAmount * 100);

    return bookingAmountCents - platformFeeCents - stripeFeeCents;
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

    return await this.bookingRepository.find({
      where: { client: { id: userId } },
      relations: ['business', 'service', 'staff'],
    });
  }

  // Get Booking by ID
  async getBookingById(orderId: string): Promise<Appointment[]> {
    const appointments = await this.bookingRepository.find({
      where: { orderId },
      relations: ['service'],
    });
    if (!appointments || appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }
    return appointments;
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
    refund?: {
      amount: number;
      currency: string;
      platformFeeWithheld: number;
      stripeFeeWithheld: number;
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
      relations: ['client', 'service'],
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

    // Pre-flight: work out the actual refund amount for any Stripe escrow
    // held on this booking BEFORE cancelling anything. The customer gets
    // back the service amount minus KHS's own platform fee minus Stripe's
    // real processing fee (looked up from the charge, not estimated) — if
    // that math goes to zero or negative, the whole cancellation is
    // blocked rather than silently refunding nothing.
    const heldPaymentIntents = await this.stripePaymentIntentRepository.find({
      where: { orderId, status: StripeEscrowStatus.HELD },
    });

    const refundPlans: { spi: StripePaymentIntent; refundAmountCents: number }[] = [];
    for (const spi of heldPaymentIntents) {
      const refundAmountCents = await this.calculateStripeRefundAmountCents(spi);
      if (refundAmountCents <= 0) {
        throw new BadRequestException(
          `Cannot cancel: after deducting the platform fee and Stripe's processing fee, no refundable amount remains for order ${orderId}. Contact an admin to review.`,
        );
      }
      refundPlans.push({ spi, refundAmountCents });
    }

    // Update status and add cancellation note. paymentStatus is reset to
    // UNPAID here too — any money that was actually collected has either
    // been refunded (Stripe) or was never charged (pay-at-venue), so a
    // stale PAID flag must not survive a cancellation. This is also what
    // makes restoreBooking's Pending/Unpaid restore below meaningful: a
    // cancelled appointment restored later needs to go through real
    // payment again, not silently re-appear as already paid.
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

    // Refund any Stripe escrow held for this booking — a no-op for
    // Paystack/gift-card/cash appointments, which have no
    // StripePaymentIntent row. Nothing was ever credited to the wallet at
    // HELD time, so unlike Paystack there's no wallet balance to reverse
    // here — only the Stripe-side charge itself needs refunding.
    let refundSummary:
      | { amount: number; currency: string; platformFeeWithheld: number; stripeFeeWithheld: number }
      | undefined;

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
        const platformFeeCents = Math.round(spi.feeAmount * 100);
        const stripeFeeCents =
          bookingAmountCents - platformFeeCents - refundAmountCents;

        refundSummary = {
          amount: refundAmountCents / 100,
          currency: spi.currency.toUpperCase(),
          platformFeeWithheld: platformFeeCents / 100,
          stripeFeeWithheld: stripeFeeCents / 100,
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
              adminNote: `Stripe refund ${stripeRefund.id} (platform fee + Stripe processing fee withheld)`,
              status: RefundStatus.PROCESSED,
              refundMethod: RefundMethod.CARD_REFUND,
            }),
          );
        }
      }
    } catch (refundError) {
      this.logger.error(
        `Failed to refund Stripe escrow for order ${orderId}: ${refundError.message}`,
        refundError.stack,
      );
    }

    const firstAppt = appointmentsToCancel[0];
    if (firstAppt?.client?.email) {
      const serviceNames = [
        ...new Set(appointmentsToCancel.map((a) => a.serviceName)),
      ].join(', ');
      this.emailService.sendCancellationConfirmationEmail(
        firstAppt.client.email,
        firstAppt.client.firstName || 'Valued Customer',
        firstAppt.business?.businessName || 'the salon',
        serviceNames,
        firstAppt.date,
        firstAppt.time,
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

    const remainingCount = appointments.filter(
      (appt) => appt.status !== AppointmentStatus.CANCELLED,
    ).length;

    return {
      message: `${appointmentsToCancel.length} appointment(s) cancelled successfully`,
      cancelledCount: appointmentsToCancel.length,
      remainingCount,
      refund: refundSummary,
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
    const appointmentDateTime = new Date(
      `${appointment.date}T${appointment.time}`,
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
    const appointments = await this.bookingRepository.find({
      where: { orderId, client: { id: user.id } },
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    const clientConfirmedAt = new Date();
    for (const appointment of appointments) {
      appointment.clientConfirmedAt = clientConfirmedAt;
    }
    await this.bookingRepository.save(appointments);

    return { message: 'Availability confirmed', clientConfirmedAt };
  }

  // Reschedule Booking
  async rescheduleBooking(
    orderId: string,
    newDate: Date,
    newTime: string,
  ): Promise<{ message: string; requiresPayment: boolean }> {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId },
      relations: ['client'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
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

  // Get Booking Fees
  async getBookingFees(): Promise<{ platformFee: number }> {
    const payments = await this.platformSettingsService.getPayments();
    return { platformFee: payments.platformFee };
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
