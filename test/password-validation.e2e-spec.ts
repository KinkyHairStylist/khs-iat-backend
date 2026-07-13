process.env.JWT_ACCESS_SECRET = 'e2e-test-jwt-access-secret-khs';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-khs';
process.env.SENDGRID_API_KEY = 'SG.e2e-test-key';
process.env.SENDGRID_FROM_EMAIL = 'noreply@khs-test.com';
process.env.SESSION_SECRET = 'e2e-test-session-secret';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_e2e';
process.env.PAYSTACK_BASE_URL = 'https://api.paystack.co';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

jest.setTimeout(60000);

describe('PasswordValidation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const validSignUpDto = {
    email: 'test-pw-validation@khs.test',
    password: 'Password123!',
    firstName: 'Test',
    surname: 'User',
    phoneNumber: '+2348123456789',
    gender: 'FEMALE',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/api/auth/signup (POST) should return 400 for missing password', async () => {
    const { password, ...dtoWithoutPassword } = validSignUpDto;
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(dtoWithoutPassword);

    expect(response.status).toBe(400);
    expect(response.body.message).toBeInstanceOf(Array);
  });

  it('/api/auth/signup (POST) should return 400 for a password less than 8 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignUpDto, password: 'Pass1!' });

    expect(response.status).toBe(400);
  });

  it('/api/auth/signup (POST) should return 400 for a password without an uppercase letter', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignUpDto, password: 'password123!' });

    expect(response.status).toBe(400);
  });

  it('/api/auth/signup (POST) should return 400 for a password without a lowercase letter', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignUpDto, password: 'PASSWORD123!' });

    expect(response.status).toBe(400);
  });

  it('/api/auth/signup (POST) should return 400 for a password without a number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignUpDto, password: 'Password!' });

    expect(response.status).toBe(400);
  });

  it('/api/auth/signup (POST) should return 400 for a password without a special character', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignUpDto, password: 'Password123' });

    expect(response.status).toBe(400);
  });
});
