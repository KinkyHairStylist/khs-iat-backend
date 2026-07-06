import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { OtpService } from '../services/otp.service';
import { EmailVerification } from '../entities/email-verification.entity';
import { PhoneVerification } from '../entities/phone-verification.entity';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../services/auth.service';

describe('OtpService phone OTP persistence', () => {
  let service: OtpService;
  let phoneOtpRepo: jest.Mocked<Pick<Repository<PhoneVerification>, 'findOne' | 'create' | 'save' | 'delete'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: getRepositoryToken(EmailVerification),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PhoneVerification),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { sendEmail: jest.fn() },
        },
        {
          provide: AuthService,
          useValue: { findByEmail: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
    phoneOtpRepo = module.get(getRepositoryToken(PhoneVerification));
  });

  it('stores phone OTPs in the repository and verifies them', async () => {
    const phone = '+1234567890';
    const createdRecord = {
      phoneNumber: phone,
      otp: '123456',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      trials: 0,
      maxTrials: 5,
    } as PhoneVerification;

    phoneOtpRepo.findOne.mockResolvedValueOnce(null);
    phoneOtpRepo.create.mockReturnValue(createdRecord as never);
    phoneOtpRepo.save.mockResolvedValue(createdRecord as never);

    const otp = await service.generatePhoneOtp(phone);

    expect(phoneOtpRepo.create).toHaveBeenCalled();
    expect(phoneOtpRepo.save).toHaveBeenCalled();
    expect(otp).toMatch(/^\d{6}$/);

    phoneOtpRepo.findOne.mockResolvedValueOnce(createdRecord as never);
    const isValid = await service.verifyPhoneOtpService(phone, '123456');

    expect(isValid).toBe(true);
    expect(phoneOtpRepo.delete).toHaveBeenCalledWith({ phoneNumber: phone });
  });
});
