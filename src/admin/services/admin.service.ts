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
import {
  Transaction,
  TransactionStatus,
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

  async getDashboardStats() {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. Total Revenue
    const totalRevenueRaw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('SUM(CAST(t.amount AS DECIMAL))', 'total')
      .where('t.status = :status', { status: TransactionStatus.COMPLETED })
      .getRawOne();
    const totalRevenue = parseFloat(totalRevenueRaw?.total || '0') || 0;

    const currentMonthRevenueRaw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('SUM(CAST(t.amount AS DECIMAL))', 'total')
      .where('t.status = :status AND t.createdAt >= :start', {
        status: TransactionStatus.COMPLETED,
        start: startOfCurrentMonth,
      })
      .getRawOne();
    const currentMonthRev = parseFloat(currentMonthRevenueRaw?.total || '0') || 0;

    const lastMonthRevenueRaw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('SUM(CAST(t.amount AS DECIMAL))', 'total')
      .where('t.status = :status AND t.createdAt >= :start AND t.createdAt <= :end', {
        status: TransactionStatus.COMPLETED,
        start: startOfLastMonth,
        end: endOfLastMonth,
      })
      .getRawOne();
    const lastMonthRev = parseFloat(lastMonthRevenueRaw?.total || '0') || 0;

    const revDiff = lastMonthRev > 0 ? ((currentMonthRev - lastMonthRev) / lastMonthRev) * 100 : (currentMonthRev > 0 ? 100 : 0);
    const revenueChange = (revDiff >= 0 ? '+' : '') + revDiff.toFixed(1) + '%';
    const revenueChangeType: 'increase' | 'decrease' = revDiff >= 0 ? 'increase' : 'decrease';

    // 2. Active Users
    const totalUsers = await this.userRepo.count();
    const usersThisWeek = await this.userRepo
      .createQueryBuilder('u')
      .where('u.createdAt >= :oneWeekAgo', { oneWeekAgo })
      .getCount();
    const usersLastWeek = await this.userRepo
      .createQueryBuilder('u')
      .where('u.createdAt >= :twoWeeksAgo AND u.createdAt < :oneWeekAgo', {
        twoWeeksAgo,
        oneWeekAgo,
      })
      .getCount();
    const userDiff = usersLastWeek > 0 ? ((usersThisWeek - usersLastWeek) / usersLastWeek) * 100 : (usersThisWeek > 0 ? 100 : 0);
    const userChange = (userDiff >= 0 ? '+' : '') + userDiff.toFixed(1) + '%';
    const userChangeType: 'increase' | 'decrease' = userDiff >= 0 ? 'increase' : 'decrease';

    // 3. Businesses
    const totalBusinesses = await this.businessRepo.count();
    const newBusinessesThisMonth = await this.businessRepo
      .createQueryBuilder('b')
      .where('b.createdAt >= :startOfCurrentMonth', { startOfCurrentMonth })
      .getCount();

    // 4. Appointments
    const totalAppointments = await this.appointmentRepo.count();
    const appointmentsThisWeek = await this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.createdAt >= :oneWeekAgo', { oneWeekAgo })
      .getCount();
    const appointmentsLastWeek = await this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.createdAt >= :twoWeeksAgo AND a.createdAt < :oneWeekAgo', {
        twoWeeksAgo,
        oneWeekAgo,
      })
      .getCount();
    const apptDiff = appointmentsLastWeek > 0 ? ((appointmentsThisWeek - appointmentsLastWeek) / appointmentsLastWeek) * 100 : (appointmentsThisWeek > 0 ? 100 : 0);
    const appointmentChange = (apptDiff >= 0 ? '+' : '') + apptDiff.toFixed(1) + '%';
    const appointmentChangeType: 'increase' | 'decrease' = apptDiff >= 0 ? 'increase' : 'decrease';

    // Format stat cards
    const statCards = [
      {
        title: 'Total Revenue',
        value: totalRevenue >= 1000 ? `$${(totalRevenue / 1000).toFixed(1)}K` : `$${totalRevenue.toFixed(2)}`,
        rawValue: totalRevenue,
        change: revenueChange,
        changeType: revenueChangeType,
        duration: 'from last month',
      },
      {
        title: 'Active Users',
        value: totalUsers.toLocaleString(),
        rawValue: totalUsers,
        change: userChange,
        changeType: userChangeType,
        duration: 'this week',
      },
      {
        title: 'Businesses',
        value: totalBusinesses.toLocaleString(),
        rawValue: totalBusinesses,
        change: `+${newBusinessesThisMonth} new`,
        changeType: 'increase' as const,
        duration: 'this month',
      },
      {
        title: 'Appointments',
        value: totalAppointments.toLocaleString(),
        rawValue: totalAppointments,
        change: appointmentChange,
        changeType: appointmentChangeType,
        duration: 'this week',
      },
    ];

    // 5. Monthly Revenue Overview (Last 6 Months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueOverview: Array<{ month: string; revenue: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthRevRaw = await this.transactionRepo
        .createQueryBuilder('t')
        .select('SUM(CAST(t.amount AS DECIMAL))', 'total')
        .where('t.status = :status AND t.createdAt >= :start AND t.createdAt <= :end', {
          status: TransactionStatus.COMPLETED,
          start,
          end,
        })
        .getRawOne();
      revenueOverview.push({
        month: monthNames[d.getMonth()],
        revenue: parseFloat(monthRevRaw?.total || '0') || 0,
      });
    }

    // 6. Service Distribution
    const serviceDistributionRaw = await this.appointmentRepo
      .createQueryBuilder('a')
      .select('a.serviceName', 'name')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('a.serviceName')
      .orderBy('count', 'DESC')
      .limit(4)
      .getRawMany();

    const colors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];
    const totalServCount = serviceDistributionRaw.reduce((sum, r) => sum + parseInt(r.count || '0', 10), 0);
    const serviceDistribution = serviceDistributionRaw.length > 0
      ? serviceDistributionRaw.map((r, index) => {
          const count = parseInt(r.count || '0', 10);
          const percent = totalServCount > 0 ? Math.round((count / totalServCount) * 100) : 0;
          return {
            name: r.name || 'General Service',
            value: percent,
            color: colors[index % colors.length],
          };
        })
      : [
          { name: 'Hair Services', value: 45, color: '#ef4444' },
          { name: 'Nail Services', value: 25, color: '#f87171' },
          { name: 'Spa Services', value: 20, color: '#fca5a5' },
          { name: 'Beauty Services', value: 10, color: '#fecaca' },
        ];

    // 7. Top Businesses Performance
    const topBusinessesRaw = await this.businessRepo
      .createQueryBuilder('b')
      .select('b.id', 'id')
      .addSelect('b.businessName', 'name')
      .addSelect('b.performance', 'performance')
      .limit(5)
      .getRawMany();

    const topBusinesses = topBusinessesRaw.map((b, index) => ({
      id: b.name || `Business ${index + 1}`,
      revenue: `$${Math.round((5 - index) * 1250)}`,
      percentage: Math.max(20, 85 - index * 15),
    }));

    // 8. Recent Activities
    const recentAppts = await this.appointmentRepo.find({
      order: { createdAt: 'DESC' },
      take: 3,
    });

    const recentBusinesses = await this.businessRepo.find({
      order: { createdAt: 'DESC' },
      take: 2,
    });

    return {
      statCards,
      revenueOverview,
      serviceDistribution,
      topBusinesses,
      recentActivities: [
        ...recentBusinesses.map((b) => ({
          title: `New business ${b.status === BusinessStatus.APPROVED ? 'approved' : 'registered'}`,
          description: `${b.businessName} - ${new Date(b.createdAt).toLocaleDateString()}`,
          status: b.status || 'Active',
          statusColor: 'bg-green-100 text-green-800',
        })),
        ...recentAppts.map((a) => ({
          title: `Appointment ${a.status || 'scheduled'}`,
          description: `${a.serviceName || 'Service'} - ${new Date(a.createdAt).toLocaleDateString()}`,
          status: a.status || 'Confirmed',
          statusColor: 'bg-blue-100 text-blue-800',
        })),
      ],
    };
  }
}
