import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';

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
      relations: ['serviceList', 'bookingHours', 'staff'],
    });

    if (!business) {
      throw new NotFoundException(`Business with id "${businessId}" not found or not approved`);
    }

    return business;
  }
}
