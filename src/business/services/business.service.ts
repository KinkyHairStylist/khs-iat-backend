import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin, In, Not, Repository } from 'typeorm';
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
import { EmailService } from '../../email/email.service';
import { BookingDay } from '../entities/booking-day.entity';
import { BlockedTimeSlot } from '../entities/blocked-time-slot.entity';
import { CreateBlockedTimeDto } from '../dtos/requests/CreateBlockedTimeDto';
import { CreateServiceDto } from '../dtos/requests/CreateServiceDto';
import { UpdateServiceDto } from '../dtos/update-service.dto';
import { DeleteServiceDto } from '../dtos/delete-service.dto';
import { AssignStaffToServiceDto } from '../dtos/assign-staff-to-service.dto';
import { Service } from '../entities/service.entity';
import { AdvertisementPlan } from '../entities/advertisement-plan.entity';
import { CreateStaffDto } from '../dtos/requests/AddStaffDto';
import { EmergencyContact } from '../entities/emergency-contact.entity';
import { Address } from '../entities/address.entity';
import { EditStaffDto } from '../dtos/requests/EditStaffDto';
import { GoogleCalendarService } from 'src/integration/services/google-calendar.service';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { BusinessWalletService } from './wallet.service';
import { MailchimpService } from 'src/integration/services/mailchimp.service';
import { BusinessOwnerSettingsService } from './business-owner-settings.service';
import { ZohoBooksService } from 'src/integration/services/zohobooks.service';
import {UserRole} from "../../all_user_entities/user-role.entity";
import {PasswordUtil} from "../utils/password.util";
import { promises } from 'dns';

@Injectable()
export class BusinessService {
  constructor(
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
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
    @InjectRepository(AdvertisementPlan)
    private advertisementPlanRepo: Repository<AdvertisementPlan>,
    private readonly passwordUtil: PasswordUtil,
    @InjectRepository(EmergencyContact)
    private emergencyRepo: Repository<EmergencyContact>,

    @InjectRepository(Address)
    private addressRepo: Repository<Address>,

    private googleCalendarService: GoogleCalendarService,
    private mailchimpService: MailchimpService,
    private emailService: EmailService,
    private readonly walletService: BusinessWalletService,
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly zohoBooksService: ZohoBooksService,
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
  ): Promise<Business> {
    if (!owner) {
      throw new BadRequestException('Owner is required to create a business');
    }

    const business = this.businessRepo.create({
      ...createBusinessDto,
      owner,
    });

    if (!owner.role) {
      owner.role = new UserRole();
    }
    owner.role.isBusiness = true;
    await this.userRepo.save(owner);

    business.ownerName = owner?.firstName + ' ' + owner?.surname || '';
    business.ownerEmail = owner?.email || '';
    business.ownerPhone = owner?.phoneNumber || '';
    business.owner.role.isBusiness = owner?.role.isBusiness || false;

    await this.businessRepo.save(business);

    // Automatically create wallet
    await this.walletService.createWalletForBusiness({
      businessId: business.id,
      ownerId: owner.id,
      currency: WalletCurrency.AUD,
    });

    return business;
  }

  async getBooking(id: string) {
    return await this.appointmentRepo.findOne({ where: { id } });
  }

  async completeBooking(id: string) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: ['business'],
    });
    if (!appointment) {
      throw new NotFoundException('Appointment Not Found');
    }

    appointment.status = AppointmentStatus.COMPLETED;
    await this.emailService.sendEmail(
      appointment.client.email,
      `Appointment with ${appointment.business.businessName} `,
      `your appointment has been completed on ${appointment.date} `,
      '',
    );

    appointment.status = AppointmentStatus.COMPLETED;

    await this.appointmentRepo.save(appointment);

    const settings = await this.businessOwnerSettingsService.findByBusinessId(
      appointment.business.id,
    );

    if (settings.integrations.mailChimp) {
      // sync client for email marketing
      await this.mailchimpService.syncContact(appointment.id);
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
        // Create customer and invoice in ZohoBooks
        const invoiceId = await this.zohoBooksService.createInvoice(id);

        // Record payment
        await this.zohoBooksService.recordPayment(id, invoiceId);

        // Store invoice ID in appointment
        appointment.zohoInvoiceId = invoiceId;
        await this.appointmentRepo.save(appointment);
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
    const client = await this.userRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client user not found');

    const business = await this.businessRepo.findOne({
      where: { id: dto.businessId },
    });
    if (!business) throw new NotFoundException('Business not found');

    let staff: Staff[] = [];
    if (dto.staffIds && dto.staffIds.length > 0) {
      staff = await this.staffRepo.find({
        where: { id: In(dto.staffIds) },
      });

      if (staff.length !== dto.staffIds.length) {
        throw new NotFoundException('One or more staff members not found');
      }
    }

    const orderId = `BKID-${Math.floor(1000000 + Math.random() * 9000000)}`;

    const appointment = this.appointmentRepo.create({
      client,
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
      // integrate Mailchimp: appointment confirmation
      await this.mailchimpService.sendAppointmentConfirmation(appointment.id);
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

  async editBlockedTime(id: string, dto: CreateBlockedTimeDto) {
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

    let user = await this.userRepo.findOne({
      where: { email: staffEmail },
      relations: ['role'],
    });

    let tempPassword: string | undefined;

    if (!user) {
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
      });

      const userRole = new UserRole();
      userRole.isSuperAdmin = false;
      userRole.isAdmin = false;
      userRole.isBusiness = false;
      userRole.isClient = false;
      userRole.isStaff = true;
      newUser.role = userRole;

      await this.userRepo.save(newUser);

      try {
        await this.emailService.sendStaffWelcomeEmail(
            staffEmail,
            firstName,
            business.businessName,
            tempPassword
        );
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail staff creation if email fails
      }
    } else {
      // Existing user → ensure they're marked as staff
      if (!user.role) user.role = new UserRole();
      user.role.isStaff = true;
      await this.userRepo.save(user);
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

  async editStaff(staffId: string, editStaffDto: EditStaffDto): Promise<Staff> {

    const staff = await this.staffRepo.findOne({
      where: { id: staffId },
      relations: ['addresses', 'emergencyContacts', 'services'],
    });

    if (!staff) {
      throw new Error('Staff not found');
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

    if(editStaffDto.settings){
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

  async getBusinessFromStaff(mail:string){
    const staff = await this.staffRepo.findOne({
      where:{email:mail},
      relations: ['business','business.serviceList'],
    })

   if (!staff) {throw new Error('No staff found')}
   if(!staff.business){throw new Error("business not found")}

    return staff.business;
  }

  async createBlockedTime(body: CreateBlockedTimeDto) {
    let business = await this.businessRepo.findOne({
      where: { ownerEmail: body.ownerMail },
    });
    if(!body.ownerMail) throw new Error('Invalid User')
    if(!business) business = await this.getBusinessFromStaff(body.ownerMail)
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

  async deleteBlockedSlot(slotId: string) {
    await this.blockedSlotRepo.delete({ id: slotId });
    return { message: 'Blocked time deleted successfully' };
  }

  async getBlockedSlots(userMail: string) {
    let business = await this.businessRepo.findOne({
      where: { ownerEmail: userMail },
    });
    if(!userMail) throw new Error('Invalid User')
    if(!business) business = await this.getBusinessFromStaff(userMail)
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

  async rescheduleBooking(body: {
    id: string;
    reason: string;
    date: string;
    time: string;
  }) {
    const { id, date, time } = body;

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

  async rejectBooking(id: string) {
    const appointment = await this.appointmentRepo.findOne({ where: { id } });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    appointment.status = AppointmentStatus.CANCELLED;
    await this.appointmentRepo.save(appointment);

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
      // integrate mailchimp: appointment rejection mail
      await this.mailchimpService.sendAppointmentRejection(appointment.id);
    }

    return appointment;
  }

  async acceptBooking(id: string) {
    const appointment = await this.appointmentRepo.findOne({ where: { id } });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    appointment.status = AppointmentStatus.CONFIRMED;
    await this.appointmentRepo.save(appointment);

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
      // integrate Mailchimp: appointment acceptance
      await this.mailchimpService.sendAppointmentAcceptance(appointment.id);
    }

    return appointment;
  }

  async getBusinessServices(userMail: string) {
    let business = await this.businessRepo.findOne({
      where: { ownerEmail: userMail },
      relations: ['serviceList'],
    });

    if(!userMail) throw new Error('Invalid User')
    if(!business) business = await this.getBusinessFromStaff(userMail)
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business.serviceList;
  }

  async getTeamMembers(userMail: string) {
    let business = await this.businessRepo.findOne({
      where: { ownerEmail: userMail },
    });
    if(!userMail) throw new Error('Invalid User')
    if(!business) business = await this.getBusinessFromStaff(userMail)
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return this.staffRepo.find({
      where: {
        business: { id: business.id },
        isActive: true,
      },
      relations: ['business'],
    });
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
          features: [
            'Featured in search results',
            'Basic analytics'
          ],
          payable: 'Basic',
          isRecommended: false,
          boost: '1.2x'
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
            'Priority support'
          ],
          payable: 'Premium',
          isRecommended: true,
          boost: '2x'
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
            'Dedicated support'
          ],
          payable: 'Elite',
          isRecommended: false,
          boost: '3.5x'
        }
      ];

      const savedPlans = await this.advertisementPlanRepo.save(defaultPlans);
      return savedPlans;
    }

    return plans;
  }

  async createService(createServiceDto: CreateServiceDto) {
    const {
      userMail,
      category,
      serviceType,
      images,
      advertisementPlanId,
      assignedStaffId,
      name,
      description,
      price,
      duration,
    } = createServiceDto;

    let business = await this.businessRepo.findOne({
      where: { ownerEmail: userMail },
    });
    if(!userMail) throw new Error('Invalid User')
    if(!business) business = await this.getBusinessFromStaff(userMail)
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
    });

    return this.serviceRepo.save(service);
  }

  async updateService(serviceId: string, updateServiceDto: UpdateServiceDto) {
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business']
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Check if user has permission to update this service (business owner or staff)
    // This would typically be handled by the controller with user context

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

  async deleteService(deleteServiceDto: DeleteServiceDto) {
    const { serviceId } = deleteServiceDto;

    const service = await this.serviceRepo.findOne({
      where: { id: serviceId }
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Check if service has any appointments
    const appointmentCount = await this.appointmentRepo.count({
      where: { service: { id: serviceId } }
    });

    if (appointmentCount > 0) {
      throw new BadRequestException('Cannot delete service that has appointments');
    }

    await this.serviceRepo.remove(service);
    return { message: 'Service deleted successfully' };
  }

  async assignStaffToService(assignStaffDto: AssignStaffToServiceDto) {
    const { serviceId, staffIds } = assignStaffDto;

    // Find the service
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business']
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Find all staff members
    const staffMembers = await this.staffRepo.find({
      where: { id: In(staffIds), business: { id: service.business.id } }
    });

    if (staffMembers.length !== staffIds.length) {
      throw new NotFoundException('One or more staff members not found or do not belong to this business');
    }

    // Assign staff to service
    service.assignedStaff = staffMembers;
    await this.serviceRepo.save(service);

    return {
      message: 'Staff assigned to service successfully',
      serviceId: service.id,
      assignedStaffCount: staffMembers.length
    };
  }

  async deactivateStaff(id: string) {
    const staff = await this.staffRepo.findOne({ where: { id: id } });
    if (!staff) throw new Error('Staff not found');
    staff.isActive = false;
    return this.staffRepo.save(staff);
  }

  async getRescheduledBookings(userId: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if(!business){
      const staff = await this.staffRepo.findOne({where: { id: userId },relations: ['business']});
      if(!staff?.business)throw new NotFoundException('Business not found');
      business = staff?.business
    }

    if (!business) {
      throw new NotFoundException('Business does not exist');
    }

    return await this.appointmentRepo.find({
      where: {
        business: { id: business.id },
        status: AppointmentStatus.RESCHEDULED,
      },
      relations: ['business', 'staff', 'client'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getBookings(userId: string) {
    let business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
    });

    if(!business){
      const staff = await this.staffRepo.findOne({where: { id: userId },relations: ['business']});
      if(!staff?.business)throw new NotFoundException('Business not found');
      business = staff?.business
    }

    if (!business) {
      throw new NotFoundException('Business does not exist');
    }

    return await this.appointmentRepo.find({
      where: {
        business: { id: business.id },
      },
      relations: ['business', 'staff', 'client'],
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
      select: ['id', 'firstName', 'surname', 'email', 'phoneNumber', 'gender', 'avatarUrl', 'createdAt']
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
      role: user.role,
      createdAt: user.createdAt,
      verified: user.isVerified 
    };
  }

  // An endpoint to get business details
  async getBusinessDetails(userId: string) {
    // Check if user is a business owner
    const business = await this.businessRepo.findOne({
      where: { owner: { id: userId } },
      relations: ['owner']
    });

    if (business) {
      // If category is empty, set default categories
      if (!business.category || business.category.length === 0) {
        business.category = [
          BusinessCategory.HAIR_SERVICES,
          BusinessCategory.NAIL_SERVICES,
          BusinessCategory.MAKEUP_SERVICES,
        ];
        await this.businessRepo.save(business);
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
          phoneNumber: business.owner.phoneNumber
        },
      };
    }

    // TODO: check if staff has manager access to update categories

    // Check if user is a staff member
    const staff = await this.staffRepo.findOne({
      where: { id: userId },
      relations: ['business', 'business.owner']
    });

    if (staff && staff.business) {
      // If category is empty, set default categories
      if (!staff.business.category || staff.business.category.length === 0) {
        staff.business.category = [
          BusinessCategory.HAIR_SERVICES,
          BusinessCategory.NAIL_SERVICES,
          BusinessCategory.MAKEUP_SERVICES,
        ];
        await this.businessRepo.save(staff.business);
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
          phoneNumber: staff.business.owner.phoneNumber
        },
      };
    }

    throw new NotFoundException('No business found for this user');
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
      relations: ['business']
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

  async removeBusinessCategories(userId: string, categoriesToRemove: BusinessCategory[]) {
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
        category => !categoriesToRemove.includes(category as BusinessCategory)
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
      relations: ['business']
    });

    if (staff && staff.business) {
      // Ensure category array exists
      if (!staff.business.category) {
        staff.business.category = [];
      }
      
      // Filter out the categories to remove
      staff.business.category = staff.business.category.filter(
        category => !categoriesToRemove.includes(category as BusinessCategory)
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
