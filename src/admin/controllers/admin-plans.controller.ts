import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { MerchantPlansService } from 'src/business/services/merchant-plans.service';
import { PLAN_TIERS } from 'src/helpers/merchant-plans.helper';
import type { PlanTier } from 'src/helpers/merchant-plans.helper';

export class UpdatePlanSettingsDto {
  // { Starter: { price, acquisitionFeeRate }, ... }; each value is validated in the service.
  @IsObject()
  @IsOptional()
  tiers?: Partial<Record<PlanTier, { price?: number; acquisitionFeeRate?: number }>>;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commissionRate?: number;

  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  trialDays?: number;

  @IsIn(PLAN_TIERS)
  @IsOptional()
  trialFeeTier?: PlanTier;

  @IsIn(PLAN_TIERS)
  @IsOptional()
  revealFeeTier?: PlanTier;
}

export class ChangeBusinessPlanDto {
  @IsIn(PLAN_TIERS)
  tier: PlanTier;
}

export class RevealDaysDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;
}

// Admin control over merchant plans: prices, the fee each plan pays, the free trial's length
// and the free window (open it, add days to its shared countdown, close it).
@ApiTags('Admin Plans')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: MerchantPlansService) {}

  @Get()
  get() {
    return this.plans.getAdminPlans();
  }

  @Patch()
  update(@Body() body: UpdatePlanSettingsDto) {
    return this.plans.updatePlanSettings(body);
  }

  // Change one merchant's plan (fee tier, and their card subscription if they pay by card).
  @Patch('business/:businessId')
  changeBusinessPlan(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @Body() body: ChangeBusinessPlanDto,
  ) {
    return this.plans.changeBusinessPlan(businessId, body.tier);
  }

  @Post('reveal/start')
  startReveal(@Body() body: RevealDaysDto) {
    return this.plans.startReveal(body.days);
  }

  @Post('reveal/extend')
  extendReveal(@Body() body: RevealDaysDto) {
    return this.plans.extendReveal(body.days);
  }

  @Post('reveal/stop')
  stopReveal() {
    return this.plans.stopReveal();
  }
}
