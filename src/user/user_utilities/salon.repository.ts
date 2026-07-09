import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';;

@Injectable()
export class BusinessRepository {
  constructor(
    @InjectRepository(Business)
    private readonly repository: Repository<Business>,
  ) {}

  createQueryBuilder(alias: string) {
    return this.repository.createQueryBuilder(alias);
  }

  // Find nearby businesses using Haversine formula
  async findNearbyBusinesses(
    lat: number,
    lng: number,
    radiusKm: number = 10,
  ): Promise<Business[]> {
    const query = this.repository
      .createQueryBuilder('business')
      .select([
        'business.id',
        'business.businessName',
        'business.businessAddress',
        'business.latitude',
        'business.longitude',
        "CAST(business.performance->>'rating' AS FLOAT) AS rating",
        'business.services',
        'ROUND(6371 * ACOS(COS(RADIANS(:lat)) * COS(RADIANS(business.latitude)) * COS(RADIANS(business.longitude) - RADIANS(:lng)) + SIN(RADIANS(:lat)) * SIN(RADIANS(business.latitude))), 2) AS distance',
      ])
      .where('business.status = :status', { status: BusinessStatus.APPROVED })
      .andWhere(
        `6371 * ACOS(COS(RADIANS(:lat)) * COS(RADIANS(business.latitude)) * COS(RADIANS(business.longitude) - RADIANS(:lng)) + SIN(RADIANS(:lat)) * SIN(RADIANS(business.latitude))) <= :radius`,
      )
      .orderBy('distance', 'ASC')
      .setParameters({ lat, lng, radius: radiusKm });

    const result = await query.getRawMany();

    // Map raw results back to Business entities (with distance)
    return result.map((row) => {
      const business = new Business();
      business.id = row.business_id;
      business.businessName = row.business_businessName;
      business.businessAddress = row.business_businessAddress;
      business.latitude = row.business_latitude;
      business.longitude = row.business_longitude;
      business.performance = { rating: parseFloat(row.rating), reviews: 0, completionRate: 0, avgResponseMins: 0 };
      business.service = row.business_services;
      business['distance'] = parseFloat(row.distance); // non-persistent
      return business;
    });
  }

  // Add distance to an existing list of businesses (non-persistent)
  addDistanceToBusinesses(businesses: Business[], lat: number, lng: number): Business[] {
    return businesses.map((business) => {
      const distance = this.calculateDistance(lat, lng, business.latitude, business.longitude);
      business['distance'] = distance;
      return business;
    });
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100; // 2 decimals
  }

  private toRad(x: number): number {
    return (x * Math.PI) / 180;
  }
}
