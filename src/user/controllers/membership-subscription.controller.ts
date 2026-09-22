import { Controller, Post, UseGuards, Req, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RolesGuard } from 'src/middleware/roles.guard';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { MembershipService } from '../services/membership-subscription.service';

@ApiTags('Membership')
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class MembershipSubscriptionController {
  constructor(
    private readonly MembershipService: MembershipService,
  ) {}

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
    return this.MembershipService.cancelMembership(userId);
  }
}
