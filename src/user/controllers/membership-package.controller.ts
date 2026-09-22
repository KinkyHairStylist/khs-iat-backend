import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { RolesGuard } from 'src/middleware/roles.guard';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { MembershipPackagePurchaseService } from '../services/membership-package-purchase.service';
import {
  PurchaseMembershipPackageDto,
  CompleteMembershipPurchaseDto,
} from '../dtos/membership-package.dto';

@ApiTags('Customer Membership Packages')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Customer)
@Controller('users/membership-packages')
export class MembershipPackageController {
  constructor(private readonly membershipPurchaseService: MembershipPackagePurchaseService) {}

  @Get()
  @ApiOperation({ summary: 'List active membership packages offered by a business' })
  async listForBusiness(@Query('businessId') businessId: string) {
    return this.membershipPurchaseService.listPackagesForBusiness(businessId);
  }

  @Get('marketplace')
  @ApiOperation({ summary: 'Browse active membership packages from every approved salon' })
  async marketplace(@Query('search') search?: string, @Query('businessId') businessId?: string) {
    return this.membershipPurchaseService.listMarketplace({ search, businessId });
  }

  @Get('owned')
  @ApiOperation({ summary: 'List membership purchases owned by the authenticated user' })
  async getOwned(@GetUser() user: User) {
    return this.membershipPurchaseService.getOwnedPurchases(user.id);
  }

  @Post(':id/purchase')
  @ApiOperation({ summary: 'Purchase a membership package (initializes Stripe payment)' })
  async purchase(
    @Param('id') id: string,
    @Body() dto: PurchaseMembershipPackageDto,
    @GetUser() user: User,
  ) {
    return this.membershipPurchaseService.initPurchase(id, dto, user);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete a membership purchase after Stripe PaymentIntent succeeds' })
  async complete(@Body() dto: CompleteMembershipPurchaseDto, @GetUser() user: User) {
    return this.membershipPurchaseService.completePurchase(dto.reference, user);
  }
}
