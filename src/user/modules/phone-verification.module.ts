import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/all_user_entities/user.entity';
import { PhoneVerificationController } from '../controllers/phone-verification.controller';
import { PhoneVerificationService } from '../services/phone-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [PhoneVerificationController],
  providers: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
