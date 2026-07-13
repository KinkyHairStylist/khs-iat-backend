import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserPreferences,
  SupportedLanguage,
} from '../user_entities/preferences.entity';
import { User } from 'src/all_user_entities/user.entity';
import { UpdateUserPreferencesDto } from '../dtos/update-user-preferences.dto';

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
  ) {}

  async getUserPreferences(user: User) {
    let preferences = await this.preferencesRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!preferences) {
      preferences = this.preferencesRepo.create({
        user: { id: user.id },
        language: SupportedLanguage.ENGLISH,
        timeZone: 'UTC',
        profileVisibility: true,
        locationServices: true,
      });
      await this.preferencesRepo.save(preferences);
    }

    return preferences;
  }

  async updateUserPreferences(user: User, dto: UpdateUserPreferencesDto) {
    let preferences = await this.preferencesRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!preferences) preferences = this.preferencesRepo.create({ user: { id: user.id } });

    Object.assign(preferences, dto);
    await this.preferencesRepo.save(preferences);

    return {
      message: 'User preferences updated successfully',
      preferences,
    };
  }
}
