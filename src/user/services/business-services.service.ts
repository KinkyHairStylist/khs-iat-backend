import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';
import { BookingDay } from 'src/business/entities/booking-day.entity';
import { Staff } from 'src/business/entities/staff.entity';

@Injectable()
export class BusinessServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
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
   * Fetch a specific approved business by its ID with services and booking hours.
   */
  async getServicesByBusinessId(businessId: string) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId, status: BusinessStatus.APPROVED },
    });

    if (!business) {
      throw new NotFoundException(`Business with id "${businessId}" not found or not approved`);
    }

    const [serviceList, bookingHours, staff] = await Promise.all([
      this.serviceRepo.find({
        where: { business: { id: businessId } },
        relations: ['assignedStaff'],
        order: { createdAt: 'DESC' },
      }),
      this.businessRepo.manager.find(BookingDay, {
        where: { business: { id: businessId } },
      }),
      this.businessRepo.manager.find(Staff, {
        where: { business: { id: businessId } },
      }),
    ]);

    business.serviceList = serviceList;
    business.bookingHours = bookingHours;
    business.staff = staff;

    return business;
  }
}
