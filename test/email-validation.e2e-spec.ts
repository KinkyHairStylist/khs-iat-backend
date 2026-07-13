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
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

jest.setTimeout(60000);

describe('EmailValidationMiddleware (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/api/auth/get-started (POST) should return 400 for missing email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/get-started')
      .send({ phone: '1234567890' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Email is required');
  });

  it('/api/auth/get-started (POST) should return 400 for invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/get-started')
      .send({ email: 'invalid-email' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid email format');
  });

  it('/api/auth/get-started (POST) should proceed for valid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/get-started')
      .send({ email: 'test-email-validation@khs.test' });

    expect(response.status).toBe(201);
  });
});
