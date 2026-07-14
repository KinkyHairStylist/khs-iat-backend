import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

import { Service } from 'src/business/entities/service.entity';
import {
  Business,
  BusinessStatus,
} from 'src/business/entities/business.entity';
import { ServiceType } from 'src/business/types/service-type.enum';

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
    date?: string;
    time?: string;
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
      date,
      time,
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
      query = query.andWhere(
        "COALESCE((business.performance->>'rating')::FLOAT, 0) >= :minRating",
        { minRating },
      );
    }

    // Filter by luxury flag.
    // Admin decision (luxuryOverride) always wins in either direction.
    // If the admin hasn't made a decision (luxuryOverride IS NULL),
    // fall back to automatic rating-based qualification (4.5+).
    if (isLuxury) {
      query = query.andWhere(
        `("business"."luxuryOverride" = true OR
            ("business"."luxuryOverride" IS NULL AND COALESCE((business.performance->>'rating')::FLOAT, 0) >= 4.5))`,
      );
    }
    // Filter by services using the real Service relation
    if (services.length > 0) {
      services.forEach((service, index) => {
        query = query.leftJoin('business.serviceList', `serviceList${index}`);
        query = query.andWhere(
          `serviceList${index}.serviceType = :service${index}`,
          {
            [`service${index}`]: service,
          },
        );
      });
    }

    if (date) {
      const parsedDate = new Date(date);
      const day = WEEKDAY_NAMES[parsedDate.getUTCDay()];

      query = query.leftJoin('business.bookingHours', 'bookingHours');
      query = query.andWhere('bookingHours.day = :day', { day });
      query = query.andWhere('bookingHours.isOpen = :isOpen', { isOpen: true });

      if (time) {
        query = query.andWhere('bookingHours.startTime <= :time', { time });
        query = query.andWhere('bookingHours.endTime >= :time', { time });
      }
    }

    // Apply sorting
    const ratingExpression =
      "COALESCE((business.performance->>'rating')::FLOAT, 0)";
    switch (sortBy) {
      case 'topRated':
        query = query.addSelect(ratingExpression, 'rating');
        query = query
          .orderBy('rating', 'DESC')
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
        query = query.addSelect(ratingExpression, 'rating');
        query = query
          .orderBy('rating', 'DESC')
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
        where: {
          business: { id: business.id },
          ...(services.length > 0 ? { serviceType: In(services) } : {}),
        },
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

  async getServiceTypes(): Promise<{ value: string; label: string }[]> {
    return Object.values(ServiceType).map((value) => {
      const label = value
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { value, label };
    });
  }

  async getLocations(): Promise<string[]> {
    const businesses = await this.businessRepository
      .createQueryBuilder('business')
      .select('DISTINCT business.businessAddress', 'address')
      .where('business.status = :status', { status: BusinessStatus.APPROVED })
      .getRawMany();

    const locations = Array.from(
      new Set(
        businesses
          .map((b) => {
            const addr = b.address || '';
            const parts = addr.split(',');
            return parts[parts.length - 1]?.trim() || '';
          })
          .filter((loc) => loc.length > 0),
      ),
    );

    return locations.sort();
  }
}
