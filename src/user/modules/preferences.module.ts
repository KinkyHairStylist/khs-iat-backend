import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreferences } from '../user_entities/preferences.entity';
import { UserPreferencesService } from '../services/preferences.service';
import { UserPreferencesController } from '../controllers/user-preferences.controller';
import { User } from 'src/all_user_entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreferences, User])],
  providers: [UserPreferencesService],
  controllers: [UserPreferencesController],
  exports: [UserPreferencesService],
})
export class PreferencesModule {}
