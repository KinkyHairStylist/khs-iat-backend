import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { FlaggedContent } from './entities/flagged-content.entity';
import { ModerationSettings } from './entities/moderation-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FlaggedContent, ModerationSettings])],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
