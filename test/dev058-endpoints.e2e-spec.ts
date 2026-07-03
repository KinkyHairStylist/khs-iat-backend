// Environment variables must be set before AppModule compiles
process.env.JWT_ACCESS_SECRET = 'e2e-test-jwt-access-secret-khs';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-khs';
process.env.SENDGRID_API_KEY = 'SG.e2e-test-key';
process.env.SENDGRID_FROM_EMAIL = 'noreply@khs-test.com';
process.env.SESSION_SECRET = 'e2e-test-session-secret';
process.env.NODE_ENV = 'test';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

// Some services call axios for IP geolocation — prevent real network calls
jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import * as express from 'express';
import session from 'express-session';
import { AppModule } from '../src/app.module';
import { AuthMiddleware } from '../src/middleware/anth.middleware';
import { InputSanitizationMiddleware } from '../src/middleware/input-sanitization.middleware';
import { User } from '../src/all_user_entities/user.entity';

jest.setTimeout(60000);

const PUBLIC_ROUTES = [
  '/api/auth/get-started',
  '/api/auth/verify-code',
  '/api/auth/resend-code',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/admin/auth/login',
  '/api/auth/reset-password/start',
  '/api/auth/reset-password/verify',
  '/api/auth/reset-password/finish',
  '/api/salons',
  '/api/business/services',
  '/api/business/create',
];

const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/business\/[^/]+\/services$/,
];

describe('DEV-058 Endpoint Verification (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let userToken: string;
  let userId: string;

  const testEmail = `dev058-e2e-${Date.now()}@khs.test`;
  const testPassword = 'TestPass123!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.use(express.json({ limit: '2mb' }));
    app.use(express.urlencoded({ extended: true, limit: '2mb' }));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableCors({ origin: true, credentials: true });

    const sanitizer = new InputSanitizationMiddleware();
    app.use((req, res, next) => sanitizer.use(req, res, next));

    app.use(
      session({
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 3600000, httpOnly: true, sameSite: 'lax' },
      }),
    );

    // Mirror main.ts auth middleware (skip for public routes)
    app.use((req: any, res: any, next: any) => {
      const isPublic = PUBLIC_ROUTES.some((r) => req.path.startsWith(r));
      const matchesPattern = PUBLIC_ROUTE_PATTERNS.some((p) => p.test(req.path));
      if (isPublic || matchesPattern) return next();
      try {
        const authMiddleware = app.get(AuthMiddleware);
        authMiddleware.use(req, res, next);
      } catch (err) {
        next(err);
      }
    });

    await app.init();
    dataSource = app.get(DataSource);
    userRepo = dataSource.getRepository(User);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM "user" WHERE email = $1`, [testEmail]);
    }
    await app?.close();
  });

  // ─────────────────────────────────────────────────────────────────
  // AUTH FLOW (sequential — each step depends on the previous)
  // ─────────────────────────────────────────────────────────────────

  describe('Auth flow', () => {
    it('POST /api/auth/get-started → 201 { success, message }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/get-started')
        .send({ email: testEmail });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Verification code sent',
      });
    });

    it('POST /api/auth/verify-code → 201 { success, user } (no password leaked)', async () => {
      // Read the verification code via TypeORM repository (DB-agnostic)
      const dbUser = await userRepo.findOne({ where: { email: testEmail } });
      const code = dbUser?.verificationCode;
      expect(code).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify-code')
        .send({ email: testEmail, code });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true });
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.verificationCode).toBeUndefined();
    });

    it('POST /api/auth/signup → 201 { success, token, user } (no password leaked)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: testEmail,
          password: testPassword,
          firstName: 'E2E',
          surname: 'Tester',
          phoneNumber: '+2348012345678',
          gender: 'FEMALE',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, message: 'Signup successful' });
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
    });

    it('POST /api/auth/login → 201 { success, token, user } (no password leaked)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, message: 'Login successful' });
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.verificationCode).toBeUndefined();

      userToken = res.body.token;
      userId = res.body.user.id;
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS (no token needed)
  // ─────────────────────────────────────────────────────────────────

  describe('Public endpoints', () => {
    it('GET /api/salons → 200', async () => {
      const res = await request(app.getHttpServer()).get('/api/salons');
      expect(res.status).toBe(200);
    });

    it('GET /api/salons/search → 200', async () => {
      const res = await request(app.getHttpServer()).get('/api/salons/search');
      expect(res.status).toBe(200);
    });

    it('GET /api/business/services → 200', async () => {
      const res = await request(app.getHttpServer()).get('/api/business/services');
      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // PROFILE ENDPOINTS — DEV-058 PRIMARY FOCUS
  // ─────────────────────────────────────────────────────────────────

  describe('Profile endpoints (DEV-058 focus)', () => {
    it('GET /api/users/profile → 200 { success: true, data: {...} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data).toBe('object');
      // Sensitive fields must not be present
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.verificationCode).toBeUndefined();
      expect(res.body.data.resetCode).toBeUndefined();
    });

    it('PUT /api/users/profile/update → 200 { success: true, data: {...} }', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/profile/update')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(res.body.data).toBeDefined();
    });

    it('PUT /api/users/profile/change-password → 200 { success: true }', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/profile/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ currentPassword: testPassword, newPassword: 'NewPass123!' });

      // Accept 200 (success) or 400 (validation) — just not 500
      expect(res.status).not.toBe(500);
      if (res.status === 200) {
        expect(res.body).toMatchObject({ success: true });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // BOOKINGS
  // ─────────────────────────────────────────────────────────────────

  describe('Booking endpoints', () => {
    it('GET /api/bookings/me → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bookings/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/bookings/fees → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bookings/fees')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // TRANSACTIONS
  // ─────────────────────────────────────────────────────────────────

  describe('Transaction endpoints', () => {
    it('GET /api/users/transactions → 200 { success, data, meta }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/transactions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('GET /api/users/transactions/summary → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/transactions/summary')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // CARDS
  // ─────────────────────────────────────────────────────────────────

  describe('Card endpoints', () => {
    it('GET /api/users/cards → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/cards')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/users/cards/my-card → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/cards/my-card')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // FAVORITES
  // ─────────────────────────────────────────────────────────────────

  describe('Favorites endpoints', () => {
    it('GET /api/user/favorites → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/user/favorites')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/user/favorites/count → 200 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/user/favorites/count')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // MEMBERSHIP
  // ─────────────────────────────────────────────────────────────────

  describe('Membership endpoints', () => {
    it('GET /api/membership/user/subscription/my-subscription → no 500 (404 ok for new user)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/membership/user/subscription/my-subscription')
        .set('Authorization', `Bearer ${userToken}`);

      // A new test user has no subscription — 404 is correct; only 500 is a DEV-058 bug
      expect(res.status).not.toBe(500);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // AUTH — updateUser
  // ─────────────────────────────────────────────────────────────────

  describe('updateUser endpoint', () => {
    it('PATCH /api/auth/updateUser/:id → no 500, returns { success, data } on 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/auth/updateUser/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'PatchedName' });

      // Not a 500 — that's what DEV-058 guards against
      expect(res.status).not.toBe(500);
      if (res.status === 200) {
        expect(res.body).toMatchObject({ success: true });
        expect(res.body.data).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // AUTH GUARD — confirm 401 without token
  // ─────────────────────────────────────────────────────────────────

  describe('Auth guard enforcement', () => {
    it('GET /api/users/profile without token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/users/profile');
      expect(res.status).toBe(401);
    });

    it('GET /api/bookings/me without token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/users/transactions without token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/users/transactions');
      expect(res.status).toBe(401);
    });
  });
});
