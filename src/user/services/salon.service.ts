import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Service } from 'src/business/entities/service.entity';
import {
  Business,
  BusinessStatus,
} from 'src/business/entities/business.entity';

@Injectable()
export class SalonService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
  ) {}

  async findAll(options: {
    page?: number;
    limit?: number;
    search?: string;
    location?: string;
    minRating?: number;
    isLuxury?: boolean;
    services?: string[];
    sortBy?: 'bestMatch' | 'topRated' | 'distance';
    lat?: number;
    lng?: number;
    category?: string;
  }): Promise<{
    data: Business[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 10,
      search = '',
      location = '',
      minRating = 0,
      isLuxury,
      services = [],
      sortBy = 'bestMatch',
      lat,
      lng,
      category,
    } = options;

    let query = this.businessRepository
      .createQueryBuilder('business')
      .where('business.status = :status', { status: BusinessStatus.APPROVED });

    // Search by business name or description
    if (search) {
      query = query.andWhere(
        '(LOWER(business.businessName) LIKE LOWER(:search) OR LOWER(business.description) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Filter by location (businessAddress)
    if (location) {
      query = query.andWhere(
        'LOWER(business.businessAddress) LIKE LOWER(:location)',
        {
          location: `%${location}%`,
        },
      );
    }

    // Filter by category
    if (category && category !== 'All Categories') {
      query = query.andWhere('business.category = :category', { category });
    }

    // Filter by minimum rating
    if (minRating > 0) {
      query = query.andWhere("business.performance->>'rating' >= :minRating", {
        minRating,
      });
    }

    // Filter by luxury flag.
    // Admin decision (luxuryOverride) always wins in either direction.
    // If the admin hasn't made a decision (luxuryOverride IS NULL),
    // fall back to automatic rating-based qualification (4.5+).
    if (isLuxury) {
      query = query.andWhere(
        `("business"."luxuryOverride" = true OR
            ("business"."luxuryOverride" IS NULL AND CAST(business.performance->>'rating' AS FLOAT) >= 4.5))`,
      );
    }
    // Filter by services (array in text column)
    if (services.length > 0) {
      services.forEach((service, index) => {
        query = query.andWhere(`:service${index} = ANY(business.services)`, {
          [`service${index}`]: service,
        });
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'topRated':
        query = query
          .orderBy("CAST(business.performance->>'rating' AS FLOAT)", 'DESC')
          .addOrderBy('business.revenue', 'DESC');
        break;

      case 'distance':
        if (lat && lng) {
          query = query
            .addSelect(
              `ROUND((6371 * ACOS(COS(RADIANS(${lat})) * COS(RADIANS(business.latitude)) * COS(RADIANS(business.longitude) - RADIANS(${lng})) + SIN(RADIANS(${lat})) * SIN(RADIANS(business.latitude))))::numeric, 2)`,
              'distance',
            )
            .orderBy('distance', 'ASC');
        }
        break;

      case 'bestMatch':
      default:
        query = query
          .orderBy("CAST(business.performance->>'rating' AS FLOAT)", 'DESC')
          .addOrderBy('business.createdAt', 'DESC');
        break;
    }

    // Pagination
    const offset = (page - 1) * limit;
    const [data, total] = await query
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Load services separately to avoid join issues with pagination
    for (const business of data) {
      business.serviceList = await this.serviceRepo.find({
        where: { business: { id: business.id } },
      });
    }

    return { data, total, page, limit };
  }

  async getServices(category?: string) {
    const query = this.serviceRepo.createQueryBuilder('service');

    if (category && category !== 'All Categories') {
      query.where('service.category = :category', { category });
    }

    return query.orderBy('service.createdAt', 'DESC').getMany();
  }

  async getBusinessById(id: string) {
    const business = await this.businessRepository.findOne({
      where: { id, status: BusinessStatus.APPROVED },
      relations: ['serviceList'],
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business;
  }

  async getServicesByBusinessId(businessId: string) {
    return this.serviceRepo.find({
      where: { business: { id: businessId } },
      relations: ['business'],
    });
  }
}
