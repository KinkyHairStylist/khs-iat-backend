import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from '../user_entities/referrals.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { User } from '../../all_user_entities/user.entity';
import { ReferralService } from '../services/referral.service';
import { ReferralController } from '../controllers/referral.controller';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Referral, Appointment, User]),
    EmailModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
