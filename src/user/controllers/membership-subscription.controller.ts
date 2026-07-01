import { Controller, Post, Body, UseGuards, Req, Get, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';

import { RolesGuard } from 'src/middleware/roles.guard';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { SubscribeMembershipDto } from '../dtos/subscribe-membership.dto';
import { MembershipService } from '../services/membership-subscription.service';

@ApiTags('Membership')
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class MembershipSubscriptionController {
  constructor(
    private readonly MembershipService: MembershipService,
  ) {}

  @Post('/user/subscription/subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Subscribe to Membership API (Initialize Payment)' })
  @ApiResponse({
    status: 201,
    description: 'Initializes membership subscription payment',
    schema: {
      example: {
        message: 'Payment initialized',
        subscriptionAmount: 150,
        platformFee: 7.5,
        totalAmount: 157.5,
        giftCardAmountUsed: 50,
        cardAmountToPay: 107.5,
        authorizationUrl: 'https://paystack.com/pay/...',
        reference: 'MEM-1234567',
      },
    },
  })
  async subscribe(@Req() req, @Body() dto: SubscribeMembershipDto) {
    const user = req.user;
    return await this.MembershipService.subscribe(user, dto);
  }

  @Post('/user/subscription/complete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Complete Membership Subscription after Payment' })
  @ApiBody({
    description: 'Transaction reference for completing the subscription',
    schema: {
      type: 'object',
      properties: {
        reference: {
          type: 'string',
          description: 'Unique transaction reference returned from payment initialization',
          example: 'MEM-1234567'
        }
      },
      required: ['reference']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Completes membership subscription after payment verification',
    schema: {
      example: {
        message: 'Membership subscription completed successfully',
        subscription: {
          id: 'uuid',
          userId: 'uuid',
          tierId: 'uuid',
          status: 'active',
          startDate: '2025-10-24T00:00:00.000Z',
          endDate: '2025-11-23T00:00:00.000Z',
          remainingSessions: 10,
        },
        subscriptionAmount: 150,
        platformFee: 7.5,
        giftCardAmountUsed: 50,
        cardAmountUsed: 107.5,
        totalPaid: 157.5,
      },
    },
  })
  async completeSubscription(@Body('reference') reference: string) {
    if (!reference) {
      throw new BadRequestException('Transaction reference is required');
    }
    return await this.MembershipService.completeSubscription(reference);
  }


  @Get('/user/subscription/my-subscription')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get User Subscription' })
  @ApiResponse({ status: 200, description: 'Fetch current user membership info' })
  async getUserSubscription(@Req() req) {
    const userId = req.user.id;
    return this.MembershipService.getUserSubscription(userId);
  }

  // Cancel Membership
  @Post('/user/subscription/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel Membership' })
  @ApiResponse({ status: 200, description: 'Cancel the current user membership' })
  async cancelMembership(@Req() req) {
    const userId = req.user.id;
    await this.MembershipService.cancelMembership(userId);
    return { success: true, message: 'Membership cancelled successfully' };
  }

  // Upgrade Membership
  @Post('/user/subscription/upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upgrade Membership' })
  @ApiResponse({ status: 200, description: 'Upgrade to next available membership tier' })
  async upgradeMembership(@Req() req) {
    const userId = req.user.id;
    await this.MembershipService.upgradeMembership(userId);
    return { success: true, message: 'Membership upgraded successfully' };
  }

  // Downgrade Membership
  @Post('/user/subscription/downgrade')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Downgrade Membership' })
  @ApiResponse({ status: 200, description: 'Downgrade to previous available membership tier' })
  async downgradeMembership(@Req() req) {
    const userId = req.user.id;
    await this.MembershipService.downgradeMembership(userId);
    return { success: true, message: 'Membership downgraded successfully' };
  }
}
