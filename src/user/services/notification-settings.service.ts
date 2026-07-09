import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserNotificationSettings } from '../user_entities/user_notification_settings.entity';
import { CustomerUpdateNotificationSettingsDto } from '../dtos/update-notification-settings.dto';
import { User } from '../../all_user_entities/user.entity';

@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectRepository(UserNotificationSettings)
    private readonly notificationRepo: Repository<UserNotificationSettings>,
  ) {}

  async getSettings(user: User): Promise<UserNotificationSettings> {
    let settings = await this.notificationRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!settings) {
      settings = this.notificationRepo.create({
        user: { id: user.id },       // ✅ Use id reference, not the full object
      });
      await this.notificationRepo.save(settings);
    }

    return settings;
  }

  async updateSettings(
    user: User,
    dto: CustomerUpdateNotificationSettingsDto,
  ): Promise<UserNotificationSettings> {
    let settings = await this.notificationRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (settings) {
      // Update existing settings
      Object.assign(settings, dto);
    } else {
      // Create new settings if they don't exist
      settings = this.notificationRepo.create({ ...dto, user });
    }

    return this.notificationRepo.save(settings);
  }
}