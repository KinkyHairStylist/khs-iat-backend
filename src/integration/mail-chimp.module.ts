import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from 'src/business/entities/appointment.entity';
import { MailchimpService } from './services/mailchimp.service';
import { MailchimpController } from './controllers/mail-chimp.controller';
import { MailchimpCredentials } from './entities/mail-chimp.entity';
import { BusinessOwnerSettingsModule } from 'src/business/business-owner-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, MailchimpCredentials]),
    BusinessOwnerSettingsModule,
  ],
  providers: [MailchimpService],
  controllers: [MailchimpController],
  exports: [MailchimpService],
})
export class MailchimpModule {}
