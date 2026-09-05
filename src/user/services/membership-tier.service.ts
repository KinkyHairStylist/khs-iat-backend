import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import { MembershipTier } from '../user_entities/membership-tier.entity';
import { MembershipPlan, BillingCycle } from 'src/business/entities/membership.entity';

@Injectable()
export class MembershipTierService {
  constructor(
    @InjectRepository(MembershipTier)
    private readonly membershipRepo: Repository<MembershipTier>,
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
  ) {}

  async syncPlansToTiers() {
    const activePlans = await this.membershipPlanRepo.find({
      where: { isActive: true },
    });

    if (activePlans.length > 0) {
      const activePlanIds: string[] = [];

      for (const plan of activePlans) {
        activePlanIds.push(plan.id);
        const initialPrice = Number(plan.price) + Number(plan.saving || 0);
        const durationDays = plan.billingCycle === BillingCycle.YEARLY ? 365 : 30;

        let tier = await this.membershipRepo.findOne({ where: { id: plan.id } });
        if (!tier) {
          tier = this.membershipRepo.create({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            initialPrice,
            availablePrice: Number(plan.price),
            durationDays,
            session: plan.sessions || 0,
            features: plan.features || [],
            isRecommended: Boolean(plan.isPopular),
          });
        } else {
          tier.name = plan.name;
          tier.description = plan.description;
          tier.initialPrice = initialPrice;
          tier.availablePrice = Number(plan.price);
          tier.durationDays = durationDays;
          tier.session = plan.sessions || 0;
          tier.features = plan.features || [];
          tier.isRecommended = Boolean(plan.isPopular);
        }
        await this.membershipRepo.save(tier);
      }

      // Remove obsolete demo tiers that don't exist in active admin plans
      try {
        const obsoleteTiers = await this.membershipRepo.find({
          where: { id: Not(In(activePlanIds)) },
        });
        if (obsoleteTiers.length > 0) {
          await this.membershipRepo.remove(obsoleteTiers);
        }
      } catch (err) {
        // If some tiers have foreign key constraints from past subscriptions, catch and ignore
      }
    }
  }

  async getAllTiers() {
    await this.syncPlansToTiers();
    return await this.membershipRepo.find({ order: { availablePrice: 'ASC' } });
  }

  async getTierById(id: string) {
    await this.syncPlansToTiers();
    const tier = await this.membershipRepo.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Membership tier with ID "${id}" not found`);
    }
    return tier;
  }

  async seedDefaultTiers() {
    const planCount = await this.membershipPlanRepo.count();
    const tierCount = await this.membershipRepo.count();

    if (planCount === 0 && tierCount === 0) {
      const defaultPlans = [
        {
          name: 'Basic Care',
          tier: 'Bronze',
          price: 49.99,
          saving: 20,
          sessions: 2,
          features: [
            '2 styling sessions per month',
            '10% off additional services',
            'Online booking priority',
            'Email reminders',
          ],
          isPopular: false,
          activeSubscribers: 0,
          description: 'Bronze membership with essential benefits.',
          billingCycle: BillingCycle.MONTHLY,
          isActive: true,
        },
        {
          name: 'Premium Hair Care',
          tier: 'Gold',
          price: 89.99,
          saving: 20,
          sessions: 4,
          features: [
            '4 styling sessions per month',
            '20% off additional services',
            'Priority booking',
            'Email reminders',
            'Complimentary hair consultation',
            'Free deep conditioning treatment',
            '24/7 customer support',
          ],
          isPopular: true,
          activeSubscribers: 0,
          description: 'Gold tier with extra perks and flexibility.',
          billingCycle: BillingCycle.MONTHLY,
          isActive: true,
        },
        {
          name: 'Luxury Experience',
          tier: 'Platinum',
          price: 149.99,
          saving: 60,
          sessions: 6,
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
          isPopular: false,
          activeSubscribers: 0,
          description: 'Platinum tier for VIP clients.',
          billingCycle: BillingCycle.MONTHLY,
          isActive: true,
        },
      ];

      for (const p of defaultPlans) {
        const plan = this.membershipPlanRepo.create(p);
        await this.membershipPlanRepo.save(plan);
      }
    }

    await this.syncPlansToTiers();
  }
}