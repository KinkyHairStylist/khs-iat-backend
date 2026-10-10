import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LandingStatService } from '../services/landing-stat.service';
import { Public } from 'src/business/middlewares/public.decorator';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';

@ApiTags('Landing - Statistics')
@Controller('landing/statistics')
export class LandingStatController {
  constructor(
    private readonly landingStatService: LandingStatService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // Managing this content (drafts, create, edit, delete, uploads) moved to
  // khs-iat-staff-be. Here those routes only checked for a login, so any
  // customer account could use them. Only the public routes remain.

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
}
