import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  UseGuards 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { RolesGuard } from 'src/middleware/roles.guard';

import { NotificationSettingsService } from '../services/notification-settings.service';
import { CustomerUpdateNotificationSettingsDto } from '../dtos/update-notification-settings.dto';

@ApiTags('Notification Settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/notification-settings')
export class NotificationSettingsController {
  constructor(private readonly notificationService: NotificationSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notification settings' })
  async getSettings(@GetUser() user: User) {
    const settings = await this.notificationService.getSettings(user);

    return {
      isSuccessful: true,
      message: 'Notification settings retrieved successfully',
      data: settings,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update user notification settings' })
  async updateSettings(@GetUser() user: User, @Body() dto: CustomerUpdateNotificationSettingsDto) {
    const updated = await this.notificationService.updateSettings(user, dto);

    return {
      isSuccessful: true,
      message: 'Notification settings updated successfully',
      data: updated,
    };
  }
}