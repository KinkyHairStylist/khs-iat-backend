import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './middlewares/strategies/jwt.strategy';
import { PasswordUtil } from './utils/password.util';
import { OtpService } from './services/otp.service';
import { BusinessService } from './services/business.service';
import { BusinessController } from './controllers/business.controller';
import { User } from '../all_user_entities/user.entity';
import { Business } from './entities/business.entity';
import { RefreshToken } from './entities/refresh.token.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { EmailModule } from '../email/email.module';
import { Appointment } from './entities/appointment.entity';
import { BusinessWalletModule } from './wallet.module';
import { Staff } from './entities/staff.entity';
import { BlockedTimeSlot } from './entities/blocked-time-slot.entity';
import { BookingDay } from './entities/booking-day.entity';
import { AdvertisementPlan } from './entities/advertisement-plan.entity';
import { Address } from './entities/address.entity';
import { Service } from './entities/service.entity';
import { EmergencyContact } from './entities/emergency-contact.entity';
import { GoogleCalendarModule } from 'src/integration/google-calendar.module';
import { MailchimpModule } from 'src/integration/mail-chimp.module';
import { BusinessOwnerSettingsModule } from './business-owner-settings.module';
import { ZohoBooksModule } from 'src/integration/zohobooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Address,
      AdvertisementPlan,
      Business,
      RefreshToken,
      EmailVerification,
      Appointment,
      Staff,
      BlockedTimeSlot,
      BookingDay,
      Service,
      EmergencyContact,
    ]),
    JwtModule.register({}),
    EmailModule,
    GoogleCalendarModule,
    MailchimpModule,
    BusinessOwnerSettingsModule,
    ZohoBooksModule,
    forwardRef(() => GoogleCalendarModule),
    forwardRef(() => BusinessWalletModule),
  ],
  controllers: [AuthController, BusinessController],
  providers: [
    AuthService,
    BusinessService,
    OtpService,
    PasswordUtil,
    JwtStrategy,
  ],
  exports: [AuthService, BusinessService, OtpService],
})
export class BusinessModule {}
