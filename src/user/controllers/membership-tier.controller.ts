import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiBearerAuth } from '@nestjs/swagger';

import { MembershipTierService } from '../services/membership-tier.service';
import { JwtAuthGuard } from 'src/business/middlewares/guards/jwt-auth.guard';

@ApiTags('Membership')
@Controller('membership')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class MembershipTierController {
  constructor(private readonly membershipTierService: MembershipTierService) {}

  @Get('/user/tiers')
  @ApiOperation({ summary: 'Get Membership Tiers' })
  @ApiResponse({
    status: 200,
    description: 'Returns all available membership tiers with price and session info',
    schema: {
      example: [
        {
          id: 'uuid',
          name: 'Luxury Experience',
          description: 'Exclusive VIP service',
          initialPrice: 40000,
          availablePrice: 30000,
          durationDays: 30,
          session: 10,
          isRecommended: false,
          createdAt: '2025-10-24T10:00:00Z',
        },
      ],
    },
  })
  async getAllTiers() {
    return await this.membershipTierService.getAllTiers();
  }

  @Get('/user/tier/:id')
  @ApiOperation({ summary: 'Get single Membership Tier by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns a single membership tier by ID',
    schema: {
      example: {
        id: 'uuid',
        name: 'Luxury Experience',
        description: 'Exclusive VIP service',
        initialPrice: 209.99,
        availablePrice: 149.99,
        durationDays: 30,
        session: 6,
        isRecommended: false,
        createdAt: '2025-10-24T10:00:00Z',
      },
    },
  })
  async getTierById(@Param('id') id: string) {
    return await this.membershipTierService.getTierById(id);
  }
}