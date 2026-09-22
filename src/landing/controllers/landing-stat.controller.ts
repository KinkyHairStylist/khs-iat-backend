import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LandingStatService } from '../services/landing-stat.service';
import { CreateLandingStatDto, UpdateLandingStatDto } from '../dtos/landing-stat.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';

@ApiTags('Landing - Statistics')
@Controller('landing/statistics')
export class LandingStatController {
  constructor(
    private readonly landingStatService: LandingStatService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // Public — so a merchant pricing/landing page can be built against real
  // data. priceId is deliberately omitted from the public response; only
  // displayAmount (UI sugar) and the 14-day-trial messaging are exposed.
  @Get('/subscription-tiers')
  @Public()
  @ApiOperation({ summary: 'Get merchant subscription tier pricing (public)' })
  async getSubscriptionTiers() {
    const payments = await this.platformSettingsService.getPayments();
    const tiers = payments.subscriptionPrices;
    return {
      trialDays: payments.trialDays ?? 14,
      tiers: {
        Starter: { displayAmount: tiers?.Starter?.displayAmount ?? 29.99, acquisitionFeeRate: payments.acquisitionFeeTiers?.Starter },
        Growth: { displayAmount: tiers?.Growth?.displayAmount ?? 59.99, acquisitionFeeRate: payments.acquisitionFeeTiers?.Growth },
        Pro: { displayAmount: tiers?.Pro?.displayAmount ?? 99.99, acquisitionFeeRate: payments.acquisitionFeeTiers?.Pro },
      },
    };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all active statistics (public)' })
  findActive() {
    return this.landingStatService.findActive();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all statistics including inactive (admin)' })
  findAll() {
    return this.landingStatService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a statistic card (admin)' })
  create(@Body() dto: CreateLandingStatDto) {
    return this.landingStatService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a statistic card (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateLandingStatDto) {
    return this.landingStatService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a statistic card (admin)' })
  remove(@Param('id') id: string) {
    return this.landingStatService.remove(id);
  }
}
