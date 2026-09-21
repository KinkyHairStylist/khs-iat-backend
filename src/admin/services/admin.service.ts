import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MerchantSubscriptionService } from '../../business/services/merchant-subscription.service';
import { EmailService } from '../../email/email.service';
import { TemplateService } from '../../email/template.service';
import { SlackService } from '../../services/slack.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';
import { invalidateCache } from '../../cache/cache.interceptor';
import { User } from '../../all_user_entities/user.entity';
import {
  Business,
  BusinessStatus,
  BusinessPlanTier,
} from '../../business/entities/business.entity';
import { ApplicationStatus } from '../../business/types/constants';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../../business/entities/appointment.entity';
import { BUSINESS_CATEGORIES } from '../../business/types/category.enum';
import {
  ChangeType,
  formatMoney,
  formatMoneyExact,
  percentChange,
  shareOfLeader,
  shareSlices,
  statusColor,
  statusLabel,
} from '../../helpers/dashboard-stats.helper';
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
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../business/entities/transaction.entity';

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
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    private emailService: EmailService,
    private templateService: TemplateService,
    private paymentService: PaymentService,
    private readonly merchantSubscriptionService: MerchantSubscriptionService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly dataSource: DataSource,
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
    const saved = await this.subscriptionRepo.save(subscription);

    SlackService.notify({
      node: SlackNode.FINANCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin cancelled customer subscription (${id})`,
      body: `An admin cancelled a customer's KHS membership subscription.
• Subscription: ${id}
• Customer: ${subscription.user?.email || 'unknown'}`,
    });

    if (subscription.user?.email) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const subject = 'Your KHS membership has been cancelled';
      const message = `Your KHS membership subscription has been cancelled by our team. If you believe this is a mistake, please contact support.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: 'Kinky Hairstylist',
        subject,
        clientName: subscription.user.firstName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(subscription.user.email, subject, message, html);
    }

    return saved;
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
    return this.appointmentRepo.find({
      relations: ['client', 'businessClient', 'business', 'staff', 'service'],
      order: { createdAt: 'DESC' },
    });
  }

  async getAppointmentById(appointmentId: string) {
    return this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['client', 'businessClient', 'business', 'staff', 'service'],
    });
  }

  async rescheduleAppointment(body) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: body.id },
      relations: ['client', 'businessClient', 'business', 'service'],
    });
    if (!appointment) {
      throw new Error('Appointment not found');
    }
    appointment.date = body.date;
    appointment.time = body.time;
    appointment.status = AppointmentStatus.RESCHEDULED;

    const recipientEmail =
      appointment.client?.email ?? appointment.businessClient?.email;
    const clientName =
      appointment.client?.firstName ||
      appointment.businessClient?.firstName ||
      'Valued Customer';
    const businessName =
      appointment.business?.businessName || 'KHS Partner Salon';
    const serviceName =
      appointment.service?.name || appointment.serviceName || 'Hair Service';

    if (recipientEmail) {
      this.emailService.sendRescheduleConfirmationEmail(
        recipientEmail,
        clientName,
        businessName,
        serviceName,
        appointment.date,
        appointment.time,
      );
    }
    return this.appointmentRepo.save(appointment);
  }

  async cancelAppointment(appointmentId: string, reason: string) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['client', 'business'],
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

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin cancelled appointment ${appointmentId}`,
      body: `An admin cancelled an appointment${payment ? ' and issued a refund' : ''}.
• Appointment: ${appointmentId}
• Business: ${appointment.business?.businessName || appointment.business?.id}
• Reason: ${reason}`,
    });

    if (appointment.client?.email) {
      this.emailService.sendCancellationConfirmationEmail(
        appointment.client.email,
        appointment.client.firstName || 'Valued Customer',
        appointment.business?.businessName || 'the salon',
        appointment.serviceName || 'your service',
        appointment.date,
        appointment.time,
        payment ? 'A refund for this appointment has been issued.' : undefined,
      );
    }

    return 'done!';
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

  SlackService.notify({
    node: SlackNode.HUMAN_RESOURCE,
    provider: SlackProvider.SYSTEM,
    severity: SlackSeverity.INFO,
    type: SlackEventType.ADMIN_ACTION,
    trigger: `Admin role ${user.isStaff ? 'granted to' : 'revoked from'} ${user.email}`,
    body: `A user's Admin role was ${user.isStaff ? 'granted' : 'revoked'} — a privilege change.
• User: ${user.firstName ?? ''} ${user.surname ?? ''} (${user.email})`,
  });

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

async getAllBusinesses() {
    const businesses = await this.businessRepo
      .createQueryBuilder('business')
      .leftJoinAndSelect('business.staff', 'staff')
      .orderBy('business.createdAt', 'DESC')
      .getMany();

    // Staff count per business (existing behavior)
    const staffCounts = new Map(
      businesses.map((business) => [
        business.id,
        business.staff ? business.staff.length : 0,
      ]),
    );

    // Real revenue + bookings from completed + paid appointments
    const statsByBusinessId = new Map<
      string,
      { revenue: number; bookings: number }
    >();

    const rawStats = await this.businessRepo
      .createQueryBuilder('business')
      .leftJoin('business.appointments', 'appointment')
      .select('business.id', 'businessId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN appointment.status = 'Completed' AND appointment."paymentStatus" = 'Paid' THEN appointment.amount ELSE 0 END), 0)`,
        'revenue',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN appointment.status = 'Completed' AND appointment."paymentStatus" = 'Paid' THEN 1 ELSE 0 END), 0)`,
        'bookings',
      )
      .where('appointment.id IS NOT NULL')
      .groupBy('business.id')
      .getRawMany<{ businessId: string; revenue: string; bookings: string }>();

    for (const stat of rawStats) {
      statsByBusinessId.set(stat.businessId, {
        revenue: parseFloat(stat.revenue) || 0,
        bookings: parseInt(stat.bookings, 10) || 0,
      });
    }

    const subscriptions = await this.merchantSubscriptionService.summariesFor(
      businesses.map((business) => business.id),
    );

    return businesses.map((business) => ({
      ...business,
      subscription: subscriptions.get(business.id) ?? null,
      staff: staffCounts.get(business.id) ?? 0,
      revenue: statsByBusinessId.get(business.id)?.revenue ?? business.revenue ?? 0,
      bookings: statsByBusinessId.get(business.id)?.bookings ?? business.bookings ?? 0,
    }));
  }

  async resolveDispute(id: string, resolutionNote: string) {
    const dispute = await this.disputeRepo.findOne({ where: { id: id } });
    if (!dispute) {
      throw new UnauthorizedException('dispute does not exist');
    }
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolutionNotes = resolutionNote;
    const saved = await this.disputeRepo.save(dispute);

    SlackService.notify({
      node: SlackNode.FINANCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Dispute resolved (${id})`,
      body: `An admin resolved a dispute.
• Dispute: ${id}
• Resolution: ${resolutionNote}`,
    });

    return saved;
  }

  async rejectApplication(id: string) {
    const application = await this.businessRepo.findOne({ where: { id } });
    if (!application) {
      throw new UnauthorizedException('Application not found');
    }
    application.status = BusinessStatus.REJECTED;
    const saved = await this.businessRepo.save(application);

    // A merchant who paid at sign-up is refunded in full. A failed refund must not undo the
    // rejection, but someone has to see it and refund by hand, so it raises a Slack alert.
    let refunded = false;
    try {
      ({ refunded } = await this.merchantSubscriptionService.cancelAndRefundForRejection(saved.id));
    } catch (error) {
      this.logger.error(`Refund failed for rejected business ${saved.id}: ${error.message}`);
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Refund FAILED for rejected merchant application: ${saved.businessName}`,
        body: `An application was rejected but the sign-up payment could not be refunded automatically. Refund it in Stripe.
• Business: ${saved.businessName} (${saved.id})
• Owner: ${saved.ownerEmail || 'unknown'}
• Error: ${error.message}`,
      });
    }

    SlackService.notify({
      node: SlackNode.FINANCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Merchant application rejected: ${saved.businessName}`,
      body: `An admin rejected a merchant application.
• Business: ${saved.businessName}
• Owner: ${saved.ownerEmail || 'unknown'}`,
    });

    if (saved.ownerEmail) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const subject = 'Your KHS merchant application';
      const message = `Thanks for applying to join KHS as a merchant. After review, we're unable to approve your application for ${saved.businessName} at this time.${refunded ? ' The payment you made when you applied has been refunded in full; it can take a few days to appear on your statement.' : ''}`;
      const html = this.templateService.render('communication-bulk', {
        businessName: saved.businessName,
        subject,
        clientName: saved.ownerName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(saved.ownerEmail, subject, message, html);
    }

    return saved;
  }

  async approveApplication(id: string) {
    const application = await this.businessRepo.findOne({ where: { id } });
    if (!application) {
      throw new UnauthorizedException('Application not found');
    }

    // "Approved" must always imply a subscription record exists (the
    // 14-day Starter trial) — wrapped in one DB transaction so the two
    // writes are never left half-true. The Stripe Customer API call
    // itself can't participate in a Postgres transaction; an orphaned
    // Stripe Customer if the transaction later fails is an accepted,
    // low-cost edge case (see merchant-subscription plan notes).
    const saved = await this.dataSource.transaction(async (manager) => {
      application.status = BusinessStatus.APPROVED;
      const savedBusiness = await manager.save(Business, application);
      // A merchant who paid, or joined MVP, already has a subscription record
      // (startTrialForBusiness leaves it alone); the trial length is set in the plan settings.
      const { trialDays } = await this.platformSettingsService.getPayments();
      await this.merchantSubscriptionService.startTrialForBusiness(
        savedBusiness,
        undefined,
        trialDays ?? 14,
      );
      return savedBusiness;
    });

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

    SlackService.notify({
      node: SlackNode.HUMAN_RESOURCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin suspended customer account: ${user.email}`,
      body: `A customer account was suspended.
• User: ${user.firstName ?? ''} ${user.surname ?? ''} (${user.email})
• Reason: ${reason}`,
    });

    return { message: `User ${user.email} has been suspended.` };
  }

  async suspendBusiness(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.status = BusinessStatus.SUSPENDED;
    await this.businessRepo.save(business);

    SlackService.notify({
      node: SlackNode.FINANCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin suspended business: ${business.businessName}`,
      body: `An admin manually suspended a live storefront.
• Business: ${business.businessName}`,
    });

    if (business.ownerEmail) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const subject = 'Your KHS storefront has been suspended';
      const message = `Your storefront for ${business.businessName} has been suspended by KHS. Please contact support for more information.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: business.businessName,
        subject,
        clientName: business.ownerName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(business.ownerEmail, subject, message, html);
    }

    return { message: `Business has been suspended.` };
  }

  async unsuspendBusiness(id: string) {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    // Uniform gate, regardless of why this business was suspended:
    // "approved" must always imply an active subscription. A business
    // suspended for an unrelated cause can't be unsuspended if its
    // subscription has separately lapsed in the meantime — billing has
    // to be fixed first.
    const hasActiveSubscription =
      await this.merchantSubscriptionService.hasActiveOrTrialingSubscription(id);
    if (!hasActiveSubscription) {
      throw new BadRequestException(
        'Cannot unsuspend: business has no active subscription. Merchant must add or update a payment method first.',
      );
    }

    business.status = BusinessStatus.APPROVED;
    await this.businessRepo.save(business);

    SlackService.notify({
      node: SlackNode.FINANCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin unsuspended business: ${business.businessName}`,
      body: `An admin restored a suspended storefront.
• Business: ${business.businessName}`,
    });

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

    SlackService.notify({
      node: SlackNode.HUMAN_RESOURCE,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Admin unsuspended customer account: ${user.email}`,
      body: `A customer account was unsuspended.
• User: ${user.firstName ?? ''} ${user.surname ?? ''} (${user.email})`,
    });

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

  // Sets a business's acquisition-fee tier (drives the % in booking.service.ts).
  // No merchant self-serve upgrade path exists yet — this is the only lever.
  async setBusinessPlanTier(id: string, planTier: BusinessPlanTier) {
    if (!Object.values(BusinessPlanTier).includes(planTier)) {
      throw new BadRequestException(
        `Invalid planTier "${planTier}" — must be one of: ${Object.values(BusinessPlanTier).join(', ')}`,
      );
    }

    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }

    business.planTier = planTier;

    await this.businessRepo.save(business);
    await invalidateCache('/api/salons');

    return { message: `Business plan tier set to ${planTier}.` };
  }

  // The numbers on the admin dashboard. Everything here comes from real records; when there is
  // nothing to show a list comes back empty (the page shows an empty state) instead of sample data.
  //   - Platform Revenue: the fees KHS keeps (type FEE, completed), the same definition the admin
  //     wallet uses, so Stripe pass-through fees are left out. Merchant subscription payments are
  //     billed in Stripe and aren't recorded as transactions, so they aren't in this figure.
  //   - Active Users: distinct customers who booked in the last 30 days.
  //   - Businesses: approved businesses only.
  //   - Top salons: booking revenue (paid, not cancelled) made this month, per approved business.
  async getDashboardStats() {
    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const oneWeekAgo = new Date(now.getTime() - 7 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY);

    // Platform revenue between two dates (or all time when no dates are given).
    const platformRevenue = async (start?: Date, end?: Date): Promise<number> => {
      const query = this.transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.type = :fee', { fee: TransactionType.FEE })
        .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
        .andWhere("(t.feeSubtype IS NULL OR t.feeSubtype != :passthrough)", {
          passthrough: 'StripePassthrough',
        });
      if (start) query.andWhere('t.createdAt >= :start', { start });
      if (end) query.andWhere('t.createdAt <= :end', { end });
      const raw = await query.getRawOne();
      return Number(raw?.total ?? 0) || 0;
    };

    const activeCustomers = async (start: Date, end: Date): Promise<number> => {
      const raw = await this.appointmentRepo
        .createQueryBuilder('a')
        .select('COUNT(DISTINCT a.client_id)', 'total')
        .where('a.createdAt >= :start AND a.createdAt < :end', { start, end })
        .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED })
        .andWhere('a.client_id IS NOT NULL')
        .getRawOne();
      return Number(raw?.total ?? 0) || 0;
    };

    const bookedBetween = (start: Date, end: Date) =>
      this.appointmentRepo
        .createQueryBuilder('a')
        .where('a.createdAt >= :start AND a.createdAt < :end', { start, end })
        .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED })
        .getCount();

    // 1. Platform revenue
    const totalRevenue = await platformRevenue();
    const currentMonthRev = await platformRevenue(startOfCurrentMonth);
    const lastMonthRev = await platformRevenue(startOfLastMonth, endOfLastMonth);
    const revenueChange = percentChange(currentMonthRev, lastMonthRev);

    // 2. Active users (customers who booked)
    const activeNow = await activeCustomers(thirtyDaysAgo, now);
    const activeBefore = await activeCustomers(sixtyDaysAgo, thirtyDaysAgo);
    const userChange = percentChange(activeNow, activeBefore);

    // 3. Businesses (approved only)
    const totalBusinesses = await this.businessRepo.count({
      where: { status: BusinessStatus.APPROVED },
    });
    const newBusinessesThisMonth = await this.businessRepo
      .createQueryBuilder('b')
      .where('b.status = :approved', { approved: BusinessStatus.APPROVED })
      .andWhere('b.createdAt >= :startOfCurrentMonth', { startOfCurrentMonth })
      .getCount();

    // 4. Appointments (not cancelled)
    const totalAppointments = await this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .getCount();
    const appointmentsThisWeek = await bookedBetween(oneWeekAgo, now);
    const appointmentsLastWeek = await bookedBetween(twoWeeksAgo, oneWeekAgo);
    const appointmentChange = percentChange(appointmentsThisWeek, appointmentsLastWeek);

    const statCards = [
      {
        title: 'Platform Revenue',
        value: formatMoney(totalRevenue),
        rawValue: totalRevenue,
        change: revenueChange.text,
        changeType: revenueChange.type,
        duration: 'vs last month',
      },
      {
        title: 'Active Users',
        value: activeNow.toLocaleString(),
        rawValue: activeNow,
        change: userChange.text,
        changeType: userChange.type,
        duration: 'vs previous 30 days',
      },
      {
        title: 'Businesses',
        value: totalBusinesses.toLocaleString(),
        rawValue: totalBusinesses,
        change: `+${newBusinessesThisMonth} new`,
        changeType: (newBusinessesThisMonth > 0 ? 'increase' : 'neutral') as ChangeType,
        duration: 'this month',
      },
      {
        title: 'Appointments',
        value: totalAppointments.toLocaleString(),
        rawValue: totalAppointments,
        change: appointmentChange.text,
        changeType: appointmentChange.type,
        duration: 'vs last week',
      },
    ];

    // 5. Monthly platform revenue (last 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueOverview: Array<{ month: string; revenue: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      revenueOverview.push({
        month: monthNames[d.getMonth()],
        revenue: Math.round((await platformRevenue(d, end)) * 100) / 100,
      });
    }

    // 6. Service distribution: bookings by service category, all non-cancelled bookings
    const serviceRows = await this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoin('a.service', 's')
      .select('s.category', 'category')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .groupBy('s.category')
      .getRawMany();

    const categoryLabels = new Map(BUSINESS_CATEGORIES.map((c) => [String(c.value), c.label]));
    const colors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];
    const serviceDistribution = shareSlices(
      serviceRows.map((r) => ({
        name: r.category ? categoryLabels.get(String(r.category)) ?? 'Other' : 'Other',
        count: parseInt(r.count || '0', 10),
      })),
      4,
    ).map((slice, index) => ({ ...slice, color: colors[index % colors.length] }));

    // 7. Top salons this month, by paid booking revenue
    const topRows = await this.appointmentRepo
      .createQueryBuilder('a')
      .innerJoin('a.business', 'b')
      .select('b.id', 'id')
      .addSelect('b.businessName', 'name')
      .addSelect('SUM(a.amount)', 'revenue')
      .where('b.status = :approved', { approved: BusinessStatus.APPROVED })
      .andWhere('a.paymentStatus = :paid', { paid: PaymentStatus.PAID })
      .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED })
      .andWhere('a.createdAt >= :startOfCurrentMonth', { startOfCurrentMonth })
      .groupBy('b.id')
      .addGroupBy('b.businessName')
      .orderBy('SUM(a.amount)', 'DESC')
      .limit(5)
      .getRawMany();

    const topAmounts = topRows.map((r) => Number(r.revenue) || 0);
    const topShares = shareOfLeader(topAmounts);
    const topBusinesses = topRows.map((r, index) => ({
      id: r.id,
      name: r.name || 'Unnamed business',
      revenue: formatMoneyExact(topAmounts[index]),
      percentage: topShares[index],
    }));

    // 8. Recent activity: newest businesses and bookings together, newest first
    const recentBusinesses = await this.businessRepo.find({ order: { createdAt: 'DESC' }, take: 5 });
    const recentAppts = await this.appointmentRepo.find({ order: { createdAt: 'DESC' }, take: 5 });

    const recentActivities = [
      ...recentBusinesses.map((b) => ({
        kind: 'business' as const,
        title: 'New business registered',
        description: b.businessName,
        status: statusLabel(b.status),
        statusColor: statusColor(b.status),
        at: new Date(b.createdAt),
      })),
      ...recentAppts.map((a) => ({
        kind: 'appointment' as const,
        title: `Appointment ${String(a.status ?? 'booked').toLowerCase()}`,
        description: [a.serviceName, a.business?.businessName].filter(Boolean).join(' · '),
        status: statusLabel(a.status),
        statusColor: statusColor(a.status),
        at: new Date(a.createdAt),
      })),
    ]
      .sort((x, y) => y.at.getTime() - x.at.getTime())
      .slice(0, 6)
      .map((item) => ({ ...item, at: item.at.toISOString() }));

    return {
      statCards,
      revenueOverview,
      serviceDistribution,
      topBusinesses,
      recentActivities,
    };
  }
}
