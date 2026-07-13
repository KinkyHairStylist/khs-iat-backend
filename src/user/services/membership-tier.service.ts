import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

import { MembershipTier } from '../user_entities/membership-tier.entity';

@Injectable()
export class MembershipTierService {
  constructor(
    @InjectRepository(MembershipTier)
    private readonly membershipRepo: Repository<MembershipTier>,
  ) {}

  async getAllTiers() {
    return await this.membershipRepo.find({ order: { availablePrice: 'ASC' } });
  }

  async getTierById(id: string) {
    const tier = await this.membershipRepo.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Membership tier with ID "${id}" not found`);
    }
    return tier;
  }

  async seedDefaultTiers() {
    const count = await this.membershipRepo.count();
    if (count === 0) {
      const tiers = [
        {
          name: 'Basic Care',
          description: 'Bronze membership with essential benefits.',
          initialPrice: 69.99,
          availablePrice: 49.99,
          durationDays: 30,
          session: 2,
          features: [
            '2 styling sessions per month',
            '10% off additional services',
            'Online booking priority',
            'Email reminders',
          ],
        },
        {
          name: 'Premium Hair Care',
          description: 'Gold tier with extra perks and flexibility.',
          initialPrice: 109.99,
          availablePrice: 89.99,
          durationDays: 30,
          session: 4,
          isRecommended: true,
          features: [
            '4 styling sessions per month',
            '20% off additional services',
            'Priority booking',
            'Email reminders',
            'Complimentary hair consultation',
            'Free deep conditioning treatment',
            '24/7 customer support',
          ],
        },
        {
          name: 'Luxury Experience',
          description: 'Platinum tier for VIP clients.',
          initialPrice: 209.99,
          availablePrice: 149.99,
          durationDays: 30,
          session: 6,
          features: [
            '6 premium sessions per month',
            '25% off all services',
            'VIP booking access',
            'Personal stylist consultation',
            'Exclusive event invitations',
            'Email reminders',
            'Complimentary hair consultation',
            'Free deep conditioning treatment',
            '24/7 customer support',
          ],
        },
      ];

        await this.membershipRepo.save(tiers);
    }
  }
}