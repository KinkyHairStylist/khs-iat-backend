import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Appointment, AppointmentStatus, PaymentStatus } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { Service } from 'src/business/entities/service.entity';
import { Staff } from 'src/business/entities/staff.entity';
import { Transaction, TransactionType, PaymentMethod, TransactionStatus as TxnStatus } from 'src/business/entities/transaction.entity';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import { PaystackService } from 'src/payment/paystack.service';
import { Card } from 'src/all_user_entities/card.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { User } from 'src/all_user_entities/user.entity';
import { ReviewService } from 'src/business/services/review.service';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { ClientSchema, ClientType } from 'src/business/entities/client.entity';

@Injectable()
export class BookingService {
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
    private platformSettingsService: PlatformSettingsService,
    private reviewService: ReviewService,
    private readonly dataSource: DataSource,
    private readonly paystack: PaystackService,
    private readonly walletService: BusinessWalletService,
  ) {}

  // Create Booking
  async createBooking(createBookingDto: any, user: User): Promise<{ orderId: string, appointments: Appointment[] }> {
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
      });

      if (!service) {
        throw new NotFoundException(`Service with ID ${serviceId} not found`);
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
        amount: service.price,
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

  // ------------------------------------------------------
  // Step 1 — Confirm/Initialize Booking Payment
  // ------------------------------------------------------
  async confirmBooking(confirmBookingDto: any, user: User): Promise<any> {
    const { orderId, payAtVenue, cardId, giftCard } = confirmBookingDto;

    // Find all appointments for this orderId
    const appointments = await this.bookingRepository.find({
      where: { orderId, client: { id: user.id } },
      relations: ['business', 'business.owner'],
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for this order ID');
    }

    if (appointments.some(appointment => appointment.status === AppointmentStatus.CONFIRMED)) {
      throw new BadRequestException('Booking is already confirmed');
    }

    // Get platform fee percentage
    const paymentsSettings = await this.platformSettingsService.getPayments();
    const platformFeePercent = Number(paymentsSettings.platformFee) || 0;

    // Calculate amounts
    const bookingAmount = appointments.reduce((sum, appt) => sum + Number(appt.amount), 0);
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
      if (gift.status !== BusinessGiftCardStatus.ACTIVE) throw new BadRequestException('Gift card is not active');
      if (gift.remainingAmount <= 0) throw new BadRequestException('Gift card has no balance');

      giftCardPayment = Math.min(Number(gift.remainingAmount), roundedTotalAmount);
      remainingToPay = roundedTotalAmount - giftCardPayment;
      
      // Round to avoid floating point precision issues
      remainingToPay = Math.round(remainingToPay * 100) / 100;
    }

    // Handle full gift card payment (no card needed) - check this FIRST
    if (remainingToPay <= 0) {
      return await this.dataSource.manager.transaction(async (manager) => {
        const gift = await manager.findOne(BusinessGiftCard, { where: { code: giftCard } });
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
          const gift = await manager.findOne(BusinessGiftCard, { where: { code: giftCard } });
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

        return {
          message: 'Booking confirmed. Payment will be collected at venue.',
          bookingAmount,
          platformFee: feeAmount,
          totalAmount: roundedTotalAmount,
          giftCardAmountUsed: giftCardPayment,
          payAtVenueAmount: remainingToPay + payAtVenueSurcharge,
          success: true,
        };
      });
    }

    // If remaining amount exists and no card ID provided, throw error
    if (remainingToPay > 0 && !cardId) {
      throw new BadRequestException('Payment method required for remaining amount');
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

    // Handle card payment (Paystack) - Initialize payment
    const reference = `BKG-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    let paystackInit: { reference: string; authorization_url: string } | null = null;

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
    const result = await this.dataSource.manager.transaction(async (manager) => {
      // Find appointments
      const appointments = await manager.find(Appointment, {
        where: { orderId },
        relations: ['business', 'business.owner'],
      });

      if (appointments.length === 0) {
        throw new NotFoundException('Appointments not found');
      }

      // Find user
      const user = await manager.findOne(User, { where: { id: meta.userId } });
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
        await manager.update(Transaction, {
          referenceId: meta.reference,
          service: 'Booking',
          method: PaymentMethod.GIFTCARD,
        }, {
          status: TxnStatus.COMPLETED,
        });
      }

      // Update appointments to confirmed
      for (const appointment of appointments) {
        appointment.status = AppointmentStatus.CONFIRMED;
        appointment.paymentStatus = PaymentStatus.PAID;
      }
      await manager.save(Appointment, appointments);

      // Update card payment transaction to COMPLETED
      await manager.update(Transaction, {
        referenceId: reference,
        service: 'Booking',
        method: PaymentMethod.PAYSTACK,
      }, {
        status: TxnStatus.COMPLETED,
      });

      // Update platform fee transaction to COMPLETED
      if (feeAmount > 0) {
        await manager.update(Transaction, {
          referenceId: meta.reference,
          service: 'Booking-Fee',
        }, {
          status: TxnStatus.COMPLETED,
        });
      }

      // Save card authorization code if available (for future recurring payments)
      if (meta.cardId && verification.authorization?.authorization_code) {
        await manager.update(Card, { id: meta.cardId }, {
          paystackAuthorizationCode: verification.authorization.authorization_code,
          paystackEmail: verification.customer?.email,
        });
      }

      return {
        appointments,
        bookingAmount,
        platformFee: feeAmount,
        giftCardAmountUsed: giftCardAmount,
        cardAmountUsed: verification.amount / 100, // Convert from kobo
        totalPaid: (verification.amount / 100) + giftCardAmount,
      };
    });

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

  
  // Get User Bookings
  async getUserBookings(userId: string): Promise<Appointment[]> {
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
  ): Promise<{ message: string; cancelledCount: number; remainingCount: number }> {
    if (!acceptedTerms) {
      throw new BadRequestException('You must accept the cancellation terms to proceed');
    }

    // Find all appointments for this orderId
    const appointments = await this.bookingRepository.find({
      where: { orderId },
      relations: ['service'],
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

    // Update status and add cancellation note
    for (const appointment of appointmentsToCancel) {
      appointment.status = AppointmentStatus.CANCELLED;
      if (cancellationsNote) {
        appointment.cancellationsNote = cancellationsNote;
      }
    }

    await this.bookingRepository.save(appointmentsToCancel);

    const remainingCount = appointments.filter(
      (appt) => appt.status !== AppointmentStatus.CANCELLED,
    ).length;

    return {
      message: `${appointmentsToCancel.length} appointment(s) cancelled successfully`,
      cancelledCount: appointmentsToCancel.length,
      remainingCount,
    };
  }

  // Restore Cancelled Booking
  async restoreBooking(orderId: string): Promise<{ message: string }> {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status !== AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Appointment is not cancelled, cannot restore');
    }

    appointment.status = AppointmentStatus.CONFIRMED; // Restore to confirmed status
    appointment.cancellationsNote = undefined; // Clear cancellation note on restore
    await this.bookingRepository.save(appointment);
    return;
  }

  // Reschedule Booking
  async rescheduleBooking(orderId: string, newDate: Date, newTime: string): Promise<void> {
    const appointment = await this.bookingRepository.findOne({
      where: { orderId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    appointment.date = newDate.toISOString().split('T')[0]; // Format as date string
    appointment.time = newTime;
    appointment.status = AppointmentStatus.RESCHEDULED;
    await this.bookingRepository.save(appointment);
    return;
  }

  // Get Booking Fees
  async getBookingFees(): Promise<{ platformFee: number }> {
    const payments = await this.platformSettingsService.getPayments();
    return { platformFee: payments.platformFee };
  }

  // Rate Business
  async rateBusiness(orderId: string, rating: number, comment: string, user: User) {
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
