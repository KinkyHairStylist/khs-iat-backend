import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
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
import { PhoneVerification } from './entities/phone-verification.entity';
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
import { ClientSchema } from './entities/client.entity';
import { GoogleCalendarModule } from 'src/integration/google-calendar.module';
import { MailchimpModule } from 'src/integration/mail-chimp.module';
import { BusinessOwnerSettingsModule } from './business-owner-settings.module';
import { BusinessFirebaseModule } from './business-firebase.module';
import { ZohoBooksModule } from 'src/integration/zohobooks.module';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { NotificationModule } from 'src/notifications/notification.module';
import { StaffCommissionEarning } from './entities/staff-commission-earning.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Address,
      AdvertisementPlan,
      Business,
      RefreshToken,
      EmailVerification,
      PhoneVerification,
      Appointment,
      Staff,
      BlockedTimeSlot,
      BookingDay,
      Service,
      Review,
      EmergencyContact,
      ClientSchema,
      StripePaymentIntent,
      StaffCommissionEarning,
    ]),
    // JwtModule is already registered globally (with the real secret) in app.module.ts —
    // a local JwtModule.register({}) used to sit here with no secret at all, which shadowed
    // the global one for every guard/service resolved through this module. That's what was
    // breaking JwtAuthGuard on BusinessController's routes (business-details, owner-details,
    // getServices, getBookings, getTeamMembers — all "secret or public key must be provided"
    // for a real, valid, correctly-signed token that worked fine on every other module's
    // routes). Found and fixed 2026-09-22.
    EmailModule,
    GoogleCalendarModule,
    MailchimpModule,
    BusinessOwnerSettingsModule,
    BusinessFirebaseModule,
    ZohoBooksModule,
    NotificationModule,
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
