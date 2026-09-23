import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../all_user_entities/user.entity';
import { Referral } from '../user_entities/referrals.entity';
import { JwtService } from '@nestjs/jwt';
import { ReferralService } from './referral.service';
import { PasswordUtil } from 'src/business/utils/password.util';
import { EmailService } from '../../email/email.service';
import { DataSource } from 'typeorm';
import * as sgMail from '@sendgrid/mail';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    process.env.SENDGRID_API_KEY = 'test-key';
    process.env.SENDGRID_FROM_EMAIL = 'test@example.com';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        // The constructor grew several more dependencies over time that
        // this test module was never updated to match, so it failed to
        // compile with a DI resolution error before a single test ran.
        { provide: getRepositoryToken(Referral), useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ReferralService, useValue: {} },
        { provide: PasswordUtil, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});