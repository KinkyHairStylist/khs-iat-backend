import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';
import { BookingDay } from 'src/business/entities/booking-day.entity';
import { BlockedTimeSlot } from 'src/business/entities/blocked-time-slot.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Staff } from 'src/business/entities/staff.entity';

@Injectable()
export class BusinessServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    @InjectRepository(BookingDay)
    private readonly bookingDayRepo: Repository<BookingDay>,

    @InjectRepository(BlockedTimeSlot)
    private readonly blockedSlotRepo: Repository<BlockedTimeSlot>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
  ) {}

  /**
   * Fetch all services across all approved businesses with pagination.
   */
  async getAllServices(options: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Service[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20 } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await this.serviceRepo.findAndCount({
      relations: ['business'],
      where: {
        business: {
          status: BusinessStatus.APPROVED,
        },
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Fetch a specific business by its ID along with services, staff, booking hours, blocked slots, and appointments via lightweight independent queries.
   */
  async getServicesByBusinessId(businessId: string) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId, status: BusinessStatus.APPROVED },
    });

    if (!business) {
      throw new NotFoundException(`Business with id "${businessId}" not found`);
    }

    // Execute separate lightweight queries in parallel to avoid Cartesian join bloat
    const [services, staff, bookingHours, blockedSlots, appointments] = await Promise.all([
      this.getServicesList(businessId),
      this.getStaffList(businessId),
      this.getBookingHoursByBusinessId(businessId),
      this.getBlockedSlotsByBusinessId(businessId),
      this.getAppointmentsByBusinessId(businessId),
    ]);

    return {
      id: business.id,
      businessName: business.businessName,
      description: business.description,
      ownerId: business.ownerId,
      ownerName: business.ownerName,
      ownerEmail: business.ownerEmail,
      ownerPhone: business.ownerPhone,
      primaryAudience: business.primaryAudience,
      category: business.category,
      businessAddress: business.businessAddress,
      businessImage: business.businessImage,
      longitude: business.longitude,
      latitude: business.latitude,
      companySize: business.companySize,
      status: business.status,
      bookings: business.bookings,
      plan: business.plan,
      performance: business.performance,
      revenueGoal: business.revenueGoal,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
      serviceList: services,
      bookingHours,
      staff,
      blockedSlots,
      appointments,
    };
  }

  /**
   * GET /business/:businessId/services list with assigned staff
   */
  async getServicesList(businessId: string) {
    const rawServices = await this.serviceRepo.find({
      where: { business: { id: businessId } },
      relations: ['assignedStaff'],
      order: { createdAt: 'ASC' },
    });

    return rawServices.map((srv) => ({
      id: srv.id,
      name: srv.name,
      category: srv.category,
      serviceType: srv.serviceType,
      description: srv.description,
      priceType: srv.priceType,
      price: srv.price,
      minPrice: srv.minPrice,
      maxPrice: srv.maxPrice,
      duration: srv.duration,
      images: srv.images,
      assignedStaff: (srv.assignedStaff || []).map((st) => ({
        id: st.id,
        name: `${st.firstName || ''} ${st.lastName || ''}`.trim() || 'Staff Member',
        firstName: st.firstName,
        lastName: st.lastName,
        email: st.email,
        phoneNumber: st.phoneNumber,
        role: st.role,
        avatar: st.avatar,
      })),
      createdAt: srv.createdAt,
      updatedAt: srv.updatedAt,
    }));
  }

  /**
   * GET /business/:businessId/staff list
   */
  async getStaffList(businessId: string) {
    const rawStaff = await this.staffRepo.find({
      where: { business: { id: businessId } },
      order: { firstName: 'ASC' },
    });

    return rawStaff.map((s) => ({
      id: s.id,
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Staff Member',
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phoneNumber: s.phoneNumber,
      role: s.role,
      isActive: s.isActive,
      avatar: s.avatar,
    }));
  }

  /**
   * GET /business/:businessId/booking-hours
   */
  async getBookingHoursByBusinessId(businessId: string) {
    const rawHours = await this.bookingDayRepo.find({
      where: { business: { id: businessId } },
    });

    return rawHours.map((bh) => ({
      id: bh.id,
      day: bh.day,
      isOpen: bh.isOpen,
      startTime: bh.startTime,
      endTime: bh.endTime,
    }));
  }

  /**
   * GET /business/:businessId/blocked-slots
   */
  async getBlockedSlotsByBusinessId(businessId: string) {
    const rawSlots = await this.blockedSlotRepo.find({
      where: { business: { id: businessId } },
      order: { date: 'ASC' },
    });

    return rawSlots.map((bs) => ({
      id: bs.id,
      date: bs.date,
      startTime: bs.startTime,
      endTime: bs.endTime,
      type: bs.type,
      title: bs.title,
      teamMember: bs.teamMember,
      description: bs.description,
    }));
  }

  /**
   * GET /business/:businessId/appointments
   */
  async getAppointmentsByBusinessId(businessId: string) {
    const rawAppointments = await this.appointmentRepo.find({
      where: { business: { id: businessId } },
      relations: ['staff'],
      order: { date: 'ASC' },
    });

    return rawAppointments.map((apt) => ({
      id: apt.id,
      date: apt.date,
      appointmentDate: apt.date,
      time: apt.time,
      startTime: apt.time,
      duration: apt.duration,
      status: apt.status,
      staff: Array.isArray(apt.staff)
        ? apt.staff.map((st) => ({
            id: st.id,
            name: `${st.firstName || ''} ${st.lastName || ''}`.trim() || 'Staff Member',
            email: st.email,
          }))
        : null,
    }));
  }
}
