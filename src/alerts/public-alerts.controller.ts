import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { Public } from 'src/business/middlewares/public.decorator';
import { AlertsService } from './alerts.service';
import { SystemAlertAudience } from './entities/system-alert.entity';

// Read-only, unauthenticated — a platform-wide banner has to be visible
// before/without login the same way it is after, and to both the
// merchant and customer apps.
@Controller('/alerts')
export class PublicAlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Public()
  @Get('active')
  async getActive(@Query('audience') audience: string) {
    if (audience !== SystemAlertAudience.MERCHANT && audience !== SystemAlertAudience.CUSTOMER) {
      throw new BadRequestException('audience must be "merchant" or "customer"');
    }
    return this.alertsService.findActiveForAudience(audience);
  }
}
