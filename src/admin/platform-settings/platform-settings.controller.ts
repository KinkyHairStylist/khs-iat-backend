import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { PlatformSettingsService } from './platform-settings.service';
import {
  UpdateGeneralSettingsDto,
  UpdateNotificationSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateFeaturesSettingsDto,
  UpdateIntegrationsSettingsDto,
} from './DTOs/platform-settings.dto';

@ApiTags('Admin Withdrawals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin)
@Controller('admin/platform-settings')
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  // 1. Get & Update General
  @Get('general') getGeneral() { return this.service.getGeneral(); }
  @Patch('general') updateGeneral(@Body() dto: UpdateGeneralSettingsDto) {
    return this.service.updateGeneral(dto);
  }

  // 2. Get & Update Notifications
  @Get('notifications') getNotifications() { return this.service.getNotifications(); }
  @Patch('notifications') updateNotifications(@Body() dto: UpdateNotificationSettingsDto) {
    return this.service.updateNotifications(dto);
  }

  // 3. Get & Update Payments
  @Get('payments') getPayments() { return this.service.getPayments(); }
  @Patch('payments') updatePayments(@Body() dto: UpdatePaymentSettingsDto) {
    return this.service.updatePayments(dto);
  }

  // 4. Get & Update Features
  @Get('features') getFeatures() { return this.service.getFeatures(); }
  @Patch('features') updateFeatures(@Body() dto: UpdateFeaturesSettingsDto) {
    return this.service.updateFeatures(dto);
  }

  // 5. Get & Update Integrations
  @Get('integrations') getIntegrations() { return this.service.getIntegrations(); }
  @Patch('integrations') updateIntegrations(@Body() dto: UpdateIntegrationsSettingsDto) {
    return this.service.updateIntegrations(dto);
  }
}
