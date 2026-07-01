import {BadRequestException, Injectable, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import { SqlSafeHelper } from '../../helpers/sql-safe.helper';
import {EmailService} from "../../email/email.service";
import {User} from "../../all_user_entities/user.entity";
import {Business, BusinessStatus} from "../../business/entities/business.entity";
import {ApplicationStatus} from "../../business/types/constants";
import {Appointment, AppointmentStatus} from "../../business/entities/appointment.entity";
import {Dispute, DisputeStatus} from "../../business/entities/dispute.entity";
import {CreateMembershipPlanDto} from "../../business/dtos/requests/CreateMembershipDto";
import {MembershipPlan} from "../../business/entities/membership.entity";
import {GetMembershipPlanDto} from "../../business/dtos/response/GetMembershipPlanDto";
import {GetSubscriptionDto} from "../../business/dtos/response/GetSubscriptionDto";
import {Status, Subscription} from "../../business/entities/subscription.entity";
import {PaymentService} from "../payment/payment.service";
import {Payment} from "../payment/entities/payment.entity";
import {GetUserDto} from "../dtos/GetUserDto";


@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(User) private userRepo: Repository<User>,
        @InjectRepository(Business) private businessRepo: Repository<Business>,
        @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
        @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,
        @InjectRepository(MembershipPlan) private membershipPlanRepo: Repository<MembershipPlan>,
        @InjectRepository(Subscription) private subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
        private emailService: EmailService,
        private paymentService: PaymentService,
    ) {

    }

    async getNearbySalons(body: { latitude: number; longitude: number }) {
        const userLat = body.latitude;
        const userLng = body.longitude;

        const radius = 15;

        const businesses = await SqlSafeHelper
            .haversineWhere(
              this.businessRepo.createQueryBuilder('business'),
              'business',
              userLat,
              userLng,
              radius,
            )
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

        const primaryBusinessAddress = user.businesses?.find(
            (business) => Boolean(business?.businessAddress),
        )?.businessAddress;

        if (primaryBusinessAddress?.trim()) {
            return primaryBusinessAddress.trim();
        }

        const primaryAddress = user.addresses?.find(
            (address) => Boolean(address?.fullAddress),
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

        return users.map((user) => ({
            id: user.id,
            name: `${user.firstName ?? ''} ${user.surname ?? ''}`.trim() || user.email,
            initials: `${user.firstName?.[0] ?? ''}${user.surname?.[0] ?? ''}`.toUpperCase(),
            location: this.getUserLocation(user),
            contactEmail: user.email,
            contactPhone: user.phoneNumber ?? 'N/A',
            status: user.isSuspended ? 'Suspended' : user.isVerified ? 'Active' : 'Pending',
            isVerified: user.isVerified,
            joinDate: user.createdAt?.toISOString() ?? new Date().toISOString(),
            activity: this.formatLoginActivity(user.activity),
            bookings: user.booking ?? 0,
            spent: user.spent ?? 0,
        }));
    }

    async createMembershipPlan(createMembershipPlanDto: CreateMembershipPlanDto) {
        const plan = this.membershipPlanRepo.create(createMembershipPlanDto);
        return await this.membershipPlanRepo.save(plan);
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

        return await this.membershipPlanRepo.save(plan);
    }

    async removeMembershipPlan(id: string,reason: string) {
        const plan = await this.membershipPlanRepo.findOne({ where: { id } });
        if (!plan) {
            throw new Error('Membership plan not found');
        }
        plan.isActive = false;
        if (plan.cancellation==null)plan.cancellation=""
        plan.cancellation+=Date.now() + reason;
        return this.membershipPlanRepo.save(plan);
    }


    async getAllMembershipPlans(): Promise<GetMembershipPlanDto[]> {
        const plans = await this.membershipPlanRepo.find({where:{isActive:true}});

        return plans.map(plan => ({
            id:plan.id,
            name: plan.name,
            tier: plan.tier,
            price: Number(plan.price),
            saving: plan.saving,
            sessions: plan.sessions,
            features: plan.features,
            isPopular: plan.isPopular,
            activeSubscribers: plan.activeSubscribers,
        }));
    }

    async cancelSubscription (id: string) {
        const subscription = await this.subscriptionRepo.findOne({where:{id}});
        if (!subscription) {
            throw new Error('Subscription plan not found');
        }
        subscription.status = Status.CANCELLED
        return await this.subscriptionRepo.save(subscription);
    }

    async getAllSubscribers(): Promise<GetSubscriptionDto[]>{
        const subscriptions = await this.subscriptionRepo.find();

        return subscriptions.map(subscription =>({

            id: subscription.id,
            user:subscription.user.firstName +" "+ subscription.user.surname,
            plan: subscription.plan.name,
            startDate: subscription.startDate.toLocaleDateString(),
            nextBilling: subscription.nextBilling.toLocaleDateString(),
            amount: subscription.plan.price,
            status: subscription.status,

        }));

    }

    async getAllAppointments(){
        return this.appointmentRepo.find();
    }

    async getAppointmentById(appointmentId: string){
        return this.appointmentRepo.findOne({where: {id: appointmentId}});
    }

    async rescheduleAppointment(body){
        const appointment = await this.appointmentRepo.findOne({
            where: { id: body.id },
            relations: ["client", "business"],
        });
        if (!appointment) {
            throw new Error('Appointment not found');
        }
        appointment.date = body.date;
        appointment.time = body.time;
        appointment.status = AppointmentStatus.RESCHEDULED;

        await this.emailService.sendEmail(appointment.client.email,
            `Appointment with ${appointment.business.businessName} `,
            `your appointment has been rescheduled to ${appointment.date} at ${appointment.time}`,
            ""
            ,)
        return  this.appointmentRepo.save(appointment);
    }

    async cancelAppointment(appointmentId: string,reason:string){
        const appointment = await this.appointmentRepo.findOne({where: {id: appointmentId}});
        if(!appointment){
            throw new UnauthorizedException('appointment does not exist');
        }

        const payment = await this.paymentRepo.findOne({ where: { appointmentId } });

        if (payment) {
            const refundObject = {
                transactionId: payment.gatewayTransactionId,
                amount: payment.amount,
                refundType: "Appointment Cancellation",
                reason: reason,
            }

            await this.paymentService.refund(refundObject);
        }

        appointment.status = AppointmentStatus.CANCELLED;
        appointment.cancellationsNote = reason;
        await this.appointmentRepo.save(appointment);
        return "done!"
    }


    async getAllBusinesses(){
        const businesses = await this.businessRepo
            .createQueryBuilder('business')
            .leftJoinAndSelect('business.staff', 'staff')
            .getMany();

        // Map to include staff count
        return businesses.map(business => ({
            ...business,
            staff: business.staff ? business.staff.length : 0
        }));
    }

    async resolveDispute(id:string,resolutionNote:string){
        const dispute = await this.disputeRepo.findOne({where: {id: id}});
        if(!dispute){
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
        return this.businessRepo.save(application);

    }

    async findByFirstName(firstName: string) {
        if (firstName.trim() === "") {
            throw new BadRequestException('Name must not be empty');
        }
        return await this.userRepo.find({ where: { firstName } });
    }

    async findBySurname(surname: string) {
        if (surname.trim() === "") {
            throw new BadRequestException('Surname must not be empty');
        }
        return await this.userRepo.find({ where: { surname } });
    }

    async findByEmail(email: string) {
        if (email.trim() === "") {
            throw new BadRequestException('Email must not be empty');
        }
        return await this.userRepo.find({ where: { email } });
    }

    async findById(id: string) {
        if (id.trim() === "") {
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

        return await this.userRepo.find({ where :  {phoneNumber: phone} });
    }

    async suspend(id: string , reason: string) {
        const user = await this.findById(id)
        if (!user) {
            throw new BadRequestException('User not found');
        }

        user.isSuspended = true;
        user.isVerified =false;
        user.suspensionHistory += Date.now() + ": reason "+reason;
        await this.userRepo.save(user);

    }

    async suspendBusiness(id: string) {
        const business = await this.businessRepo.findOne({ where: {id}})
        if (!business) {
            throw new BadRequestException('User not found');
        }

        business.status = BusinessStatus.SUSPENDED;

        await this.businessRepo.save(business);

    }

    async unsuspendBusiness(id: string) {
        const business = await this.businessRepo.findOne({ where: {id}})
        if (!business) {
            throw new BadRequestException('Business not found');
        }

        business.status = BusinessStatus.APPROVED;

        await this.businessRepo.save(business);

    }

    async unsuspend(id: string) {
        const user = await this.findById(id)
        if (!user) {
            throw new BadRequestException('User not found');
        }

        user.isSuspended = false;
        user.isVerified = true;
        await this.userRepo.save(user);

    }


}


