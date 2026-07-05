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

describe('AppController (e2e)', () => {
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

  it('GET /api/salons → 200 (app is up)', () => {
    return request(app.getHttpServer())
      .get('/api/salons')
      .expect(200);
  });
});
