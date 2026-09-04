import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { invalidateCache } from '../../cache/cache.interceptor';
import { User } from '../../all_user_entities/user.entity';
import {
  Business,
  BusinessStatus,
} from '../../business/entities/business.entity';
import { ApplicationStatus } from '../../business/types/constants';
import {
  Appointment,
  AppointmentStatus,
} from '../../business/entities/appointment.entity';
import { AdminRole } from '../../middleware/admin-role.enum';
import { Dispute, DisputeStatus } from '../../business/entities/dispute.entity';
import { CreateMembershipPlanDto } from '../../business/dtos/requests/CreateMembershipDto';
import { MembershipPlan, BillingCycle } from '../../business/entities/membership.entity';
import { MembershipTier } from '../../user/user_entities/membership-tier.entity';
import { GetMembershipPlanDto } from '../../business/dtos/response/GetMembershipPlanDto';
import { GetSubscriptionDto } from '../../business/dtos/response/GetSubscriptionDto';
import {
  Status,
  Subscription,
} from '../../business/entities/subscription.entity';
import { PaymentService } from '../payment/payment.service';
import { Payment } from '../payment/entities/payment.entity';
import { GetUserDto } from '../dtos/GetUserDto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,
    @InjectRepository(MembershipPlan)
    private membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(MembershipTier)
    private membershipTierRepo: Repository<MembershipTier>,
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    private emailService: EmailService,
    private paymentService: PaymentService,
  ) {}

  async getNearbySalons(body: { latitude: number; longitude: number }) {
    const userLat = body.latitude;
    const userLng = body.longitude;

    const radius = 15;

    const businesses = await this.businessRepo
      .createQueryBuilder('business')
      .addSelect(
        `
        (6371 * acos(
          cos(radians(:userLat)) *
          cos(radians(business.latitude)) *
          cos(radians(business.longitude) - radians(:userLng)) +
          sin(radians(:userLat)) *
          sin(radians(business.latitude))
        ))`,
        'distance',
      )
      .having('distance <= :radius', { radius })
      .setParameters({ userLat, userLng })
      .orderBy('distance', 'ASC')
      .getRawMany();

    return businesses;
  }

  private getUserLocation(user: User): string {
    const locationParts = [user.city, user.state, user.country]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (locationParts.length > 0) {
      return locationParts.join(', ');
    }

    const primaryBusinessAddress = user.businesses?.find((business) =>
      Boolean(business?.businessAddress),
    )?.businessAddress;

    if (primaryBusinessAddress?.trim()) {
      return primaryBusinessAddress.trim();
    }

    const primaryAddress = user.addresses?.find((address) =>
      Boolean(address?.fullAddress),
    )?.fullAddress;

    if (primaryAddress?.trim()) {
      return primaryAddress.trim();
    }

    if (user.latitude && user.longitude) {
      return `${Number(user.latitude).toFixed(4)}, ${Number(user.longitude).toFixed(4)}`;
    }

    return 'N/A';
  }

  private formatLoginActivity(activityValue?: string): string {
    if (!activityValue) {
      return 'Never logged in';
    }

    if (activityValue === 'just now') {
      return 'Never logged in';
    }

    const parsed = new Date(activityValue);
    if (Number.isNaN(parsed.getTime())) {
      return 'Never logged in';
    }

    const diffMs = Date.now() - parsed.getTime();
    if (diffMs < 60_000) {
      return 'Just now';
    }

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    if (days < 30) {
      return `${days}d ago`;
    }

    return parsed.toLocaleDateString();
  }

  async getAllUsers(): Promise<GetUserDto[]> {
    const users = await this.userRepo.find({
      relations: ['businesses'],
      order: { createdAt: 'DESC' },
    });

    return users.map((user) => {
      const persona = user.isStaff ? 'Admin' : user.isMerchant ? 'Merchant' : 'Customer';
      return {
        id: user.id,
        name:
          `${user.firstName ?? ''} ${user.surname ?? ''}`.trim() || user.email,
        initials:
          `${user.firstName?.[0] ?? ''}${user.surname?.[0] ?? ''}`.toUpperCase(),
        location: this.getUserLocation(user),
        contactEmail: user.email,
        contactPhone: user.phoneNumber ?? 'N/A',
        status: user.isSuspended
          ? 'Suspended'
          : user.isVerified
            ? 'Active'
            : 'Pending',
        isVerified: user.isVerified,
        isStaff: Boolean(user.isStaff),
        isMerchant: Boolean(user.isMerchant),
        isCustomer: Boolean(user.isCustomer),
        persona,
        joinDate: user.createdAt?.toISOString() ?? new Date().toISOString(),
        activity: this.formatLoginActivity(user.activity),
        bookings: user.booking ?? 0,
        spent: user.spent ?? 0,
      };
    });
  }

  async createMembershipPlan(createMembershipPlanDto: CreateMembershipPlanDto) {
    const plan = this.membershipPlanRepo.create(createMembershipPlanDto);
    const savedPlan = await this.membershipPlanRepo.save(plan);

    try {
      const initialPrice = Number(savedPlan.price) + Number(savedPlan.saving || 0);
      const durationDays = savedPlan.billingCycle === BillingCycle.YEARLY ? 365 : 30;
      const tier = this.membershipTierRepo.create({
        id: savedPlan.id,
        name: savedPlan.name,
        description: savedPlan.description,
        initialPrice,
        availablePrice: Number(savedPlan.price),
        durationDays,
        session: savedPlan.sessions || 0,
        features: savedPlan.features || [],
        isRecommended: Boolean(savedPlan.isPopular),
      });
      await this.membershipTierRepo.save(tier);
    } catch (err) {
      this.logger.error('Failed to sync created plan to membershipTierRepo:', err);
    }

    return savedPlan;
  }

  async updateMembershipPlan(
    id: string,
    createMembershipPlanDto: CreateMembershipPlanDto,
  ) {
    const plan = await this.membershipPlanRepo.findOne({ where: { id } });

    if (!plan) {
      throw new Error('Membership plan not found');
    }

    Object.assign(plan, createMembershipPlanDto);
    const savedPlan = await this.membershipPlanRepo.save(plan);

    try {
      let tier = await this.membershipTierRepo.findOne({ where: { id } });
      const initialPrice = Number(savedPlan.price) + Number(savedPlan.saving || 0);
      const durationDays = savedPlan.billingCycle === BillingCycle.YEARLY ? 365 : 30;
      if (tier) {
        tier.name = savedPlan.name;
        tier.description = savedPlan.description;
        tier.initialPrice = initialPrice;
        tier.availablePrice = Number(savedPlan.price);
        tier.durationDays = durationDays;
        tier.session = savedPlan.sessions || 0;
        tier.features = savedPlan.features || [];
        tier.isRecommended = Boolean(savedPlan.isPopular);
        await this.membershipTierRepo.save(tier);
      } else {
        tier = this.membershipTierRepo.create({
          id: savedPlan.id,
          name: savedPlan.name,
          description: savedPlan.description,
          initialPrice,
          availablePrice: Number(savedPlan.price),
          durationDays,
          session: savedPlan.sessions || 0,
          features: savedPlan.features || [],
          isRecommended: Boolean(savedPlan.isPopular),
        });
        await this.membershipTierRepo.save(tier);
      }
    } catch (err) {
      this.logger.error('Failed to sync updated plan to membershipTierRepo:', err);
    }

    return savedPlan;
  }

  async removeMembershipPlan(id: string, reason: string) {
    const plan = await this.membershipPlanRepo.findOne({ where: { id } });
    if (!plan) {
      throw new Error('Membership plan not found');
    }
    plan.isActive = false;
    if (plan.cancellation == null) plan.cancellation = '';
    plan.cancellation += Date.now() + reason;
    await this.membershipPlanRepo.save(plan);

    try {
      await this.membershipTierRepo.delete({ id });
    } catch (err) {
      this.logger.error('Failed to remove tier from membershipTierRepo:', err);
    }

    return plan;
  }

  async setPopularPlan(id: string) {
    const plans = await this.membershipPlanRepo.find();
    for (const plan of plans) {
      plan.isPopular = plan.id === id;
      await this.membershipPlanRepo.save(plan);
    }

    try {
      const tiers = await this.membershipTierRepo.find();
      for (const tier of tiers) {
        tier.isRecommended = tier.id === id;
        await this.membershipTierRepo.save(tier);
      }
    } catch (err) {
      this.logger.error('Failed to sync popular tier to membershipTierRepo:', err);
    }

    return await this.getAllMembershipPlans();
  }

  async getAllMembershipPlans(): Promise<GetMembershipPlanDto[]> {
    let plans = await this.membershipPlanRepo.find({
      where: { isActive: true },
    });

    if (plans.length === 0) {
      const existingTiers = await this.membershipTierRepo.find();
      if (existingTiers.length > 0) {
        for (const t of existingTiers) {
          const tierCategory = t.name.toLowerCase().includes('gold') || t.name.toLowerCase().includes('premium')
            ? 'Gold'
            : t.name.toLowerCase().includes('platinum') || t.name.toLowerCase().includes('luxury')
            ? 'Platinum'
            : 'Bronze';

          const saving = Math.max(0, Number(t.initialPrice) - Number(t.availablePrice));
          const plan = this.membershipPlanRepo.create({
            id: t.id,
            name: t.name,
            tier: tierCategory,
            price: Number(t.availablePrice),
            saving: saving,
            sessions: t.session || 0,
            features: t.features || [],
            isPopular: Boolean(t.isRecommended),
            activeSubscribers: 0,
            description: t.description || '',
            billingCycle: t.durationDays === 365 ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
            isActive: true,
          });
          await this.membershipPlanRepo.save(plan);
        }
        plans = await this.membershipPlanRepo.find({
          where: { isActive: true },
        });
      }
    }

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      price: Number(plan.price),
      saving: plan.saving,
      sessions: plan.sessions,
      features: plan.features,
      isPopular: plan.isPopular,
      activeSubscribers: plan.activeSubscribers,
      description: plan.description,
      billingCycle: plan.billingCycle,
    }));
  }

  async cancelSubscription(id: string) {
    const subscription = await this.subscriptionRepo.findOne({ where: { id } });
    if (!subscription) {
      throw new Error('Subscription plan not found');
    }
    subscription.status = Status.CANCELLED;
    return await this.subscriptionRepo.save(subscription);
  }

  async getAllSubscribers(): Promise<GetSubscriptionDto[]> {
    const subscriptions = await this.subscriptionRepo.find();

    return subscriptions.map((subscription) => {
      const planName = subscription.plan?.name ?? 'N/A';
      const totalSessions = subscription.plan?.sessions ?? 0;
      const usedSessions = subscription.duration ?? 0;
      const remainingSessions = Math.max(0, totalSessions - usedSessions);

      return {
        id: subscription.id,
        user: subscription.user
          ? `${subscription.user.firstName ?? ''} ${subscription.user.surname ?? ''}`.trim() || subscription.user.email
          : 'N/A',
        userEmail: subscription.user?.email ?? 'N/A',
        userPhone: subscription.user?.phoneNumber ?? 'N/A',
        plan: planName,
        tier: subscription.plan?.tier ?? 'Bronze',
        startDate: subscription.startDate ? new Date(subscription.startDate).toLocaleDateString() : 'N/A',
        nextBilling: subscription.nextBilling ? new Date(subscription.nextBilling).toLocaleDateString() : 'N/A',
        amount: Number(subscription.plan?.price ?? 0),
        status: subscription.status ?? Status.ACTIVE,
        totalSessions,
        usedSessions,
        remainingSessions,
        planDescription: subscription.plan?.description ?? '',
        planFeatures: subscription.plan?.features ?? [],
        billingCycle: subscription.plan?.billingCycle ?? 'MONTHLY',
      };
    });
  }

  async getAllAppointments() {
    return this.appointmentRepo.find();
  }

  async getAppointmentById(appointmentId: string) {
    return this.appointmentRepo.findOne({ where: { id: appointmentId } });
  }

  async rescheduleAppointment(body) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: body.id },
      relations: ['client', 'businessClient', 'business'],
    });
    if (!appointment) {
      throw new Error('Appointment not found');
    }
    appointment.date = body.date;
    appointment.time = body.time;
    appointment.status = AppointmentStatus.RESCHEDULED;

    const recipientEmail =
      appointment.client?.email ?? appointment.businessClient?.email;
    if (recipientEmail) {
      await this.emailService.sendEmail(
        recipientEmail,
        `Appointment with ${appointment.business.businessName} `,
        `your appointment has been rescheduled to ${appointment.date} at ${appointment.time}`,
        '',
      );
    }
    return this.appointmentRepo.save(appointment);
  }

  async cancelAppointment(appointmentId: string, reason: string) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new UnauthorizedException('appointment does not exist');
    }

    const payment = await this.paymentRepo.findOne({
      where: { appointmentId },
    });

    if (payment) {
      const refundObject = {
        transactionId: payment.gatewayTransactionId,
        amount: payment.amount,
        refundType: 'Appointment Cancellation',
        reason: reason,
      };

      await this.paymentService.refund(refundObject);
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellationsNote = reason;
    await this.appointmentRepo.save(appointment);
    return 'done!';
  }

  async getAllBusinesses() {
    const businesses = await this.businessRepo
      .createQueryBuilder('business')
      .leftJoinAndSelect('business.staff', 'staff')
      .getMany();

    // Map to include staff count
    return businesses.map((business) => ({
      ...business,
      staff: business.staff ? business.staff.length : 0,
    }));
  }

  async resolveDispute(id: string, resolutionNote: string) {
    const dispute = await this.disputeRepo.findOne({ where: { id: id } });
    if (!dispute) {
      throw new UnauthorizedException('dispute does not exist');
    }
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolutionNotes = resolutionNote;
    return this.disputeRepo.save(dispute);
  }

  async rejectApplication(id: string) {
    const application = await this.businessRepo.findOne({ where: { id } });
    if (!application) {
      throw new UnauthorizedException('Application not found');
    }
    application.status = BusinessStatus.REJECTED;
    return this.businessRepo.save(application);
  }

  async approveApplication(id: string) {
    const application = await this.businessRepo.findOne({ where: { id } });
    if (!application) {
      throw new UnauthorizedException('Application not found');
    }
    application.status = BusinessStatus.APPROVED;
    const saved = await this.businessRepo.save(application);

    try {
      this.emailService.sendMerchantVerifiedEmail(
        saved.ownerEmail || '',
        saved.businessName,
        saved.id,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send merchant verified email: ${error.message}`,
      );
    }

    return saved;
  }

  async findByFirstName(firstName: string) {
    if (firstName.trim() === '') {
      throw new BadRequestException('Name must not be empty');
    }
    return await this.userRepo.find({ where: { firstName } });
  }

  async findBySurname(surname: string) {
    if (surname.trim() === '') {
      throw new BadRequestException('Surname must not be empty');
    }
    return await this.userRepo.find({ where: { surname } });
  }

  async findByEmail(email: string) {
    if (email.trim() === '') {
      throw new BadRequestException('Email must not be empty');
    }
    return await this.userRepo.find({ where: { email } });
  }

  async findById(id: string) {
    if (id.trim() === '') {
      throw new BadRequestException('Id must not be empty');
    }
    return await this.userRepo.findOneById(id);
  }

  async findAllSuspended() {
    return await this.userRepo.find({
      where: { isVerified: true },
    });
  }

  async findAllNotSuspended() {
    return await this.userRepo.find({
      where: { isVerified: false },
    });
  }

  async findByPhoneNumber(phone: string) {
    return await this.userRepo.find({ where: { phoneNumber: phone } });
  }

  async suspend(id: string, reason: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.isSuspended = true;
    user.isVerified = false;
    user.suspensionHistory += Date.now() + ': reason ' + reason;
    await this.userRepo.save(user);

    return { message: `User ${user.email} has been suspended.` };
  }

  async suspendBusiness(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.status = BusinessStatus.SUSPENDED;
    await this.businessRepo.save(business);

    return { message: `Business has been suspended.` };
  }

  async unsuspendBusiness(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.status = BusinessStatus.APPROVED;
    await this.businessRepo.save(business);

    return { message: `Business has been unsuspended.` };
  }

  async unsuspend(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.isSuspended = false;
    user.isVerified = true;
    await this.userRepo.save(user);

    return { message: `User ${user.email} has been unsuspended.` };
  }

  async markBusinessLuxury(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.luxuryOverride = true;

    await this.businessRepo.save(business);
    await invalidateCache('/api/salons');

    return { message: `Business has been marked as luxury.` };
  }

  async unmarkBusinessLuxury(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.luxuryOverride = false;

    await this.businessRepo.save(business);
    await invalidateCache('/api/salons');

    return { message: `Business has been removed from luxury.` };
  }

  async updateUserRole(id: string, role?: 'ADMIN' | 'CLIENT' | 'CUSTOMER') {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isMerchant && !user.isStaff) {
      throw new BadRequestException('Role update is not supported for merchant/business accounts.');
    }

    if (role === 'ADMIN' || (role === undefined && !user.isStaff)) {
      user.isStaff = true;
      user.adminRole = AdminRole.ADMIN;
      user.isCustomer = false;
    } else {
      user.isStaff = false;
      user.adminRole = null;
      user.isCustomer = true;
    }

    await this.userRepo.save(user);

    return {
      message: user.isStaff
        ? `User ${user.firstName ?? user.email} updated to Admin role.`
        : `Admin role removed for ${user.firstName ?? user.email}.`,
      user: {
        id: user.id,
        isStaff: Boolean(user.isStaff),
        isMerchant: Boolean(user.isMerchant),
        isCustomer: Boolean(user.isCustomer),
        persona: user.isStaff ? 'Admin' : user.isMerchant ? 'Merchant' : 'Customer',
      },
    };
  }
}
