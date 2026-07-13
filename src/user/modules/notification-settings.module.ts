import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserNotificationSettings } from '../user_entities/user_notification_settings.entity';
import { NotificationSettingsService } from '../services/notification-settings.service';
import { NotificationSettingsController } from '../controllers/notification-settings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserNotificationSettings]),
  ],
  providers: [NotificationSettingsService],
  controllers: [NotificationSettingsController],
  exports: [NotificationSettingsService]
})
export class NotificationSettingsModule {}