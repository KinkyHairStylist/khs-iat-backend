// Must be set before AppModule compiles
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
import * as express from 'express';
import session from 'express-session';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthMiddleware } from '../src/middleware/anth.middleware';
import { InputSanitizationMiddleware } from '../src/middleware/input-sanitization.middleware';
import { User } from '../src/all_user_entities/user.entity';
import { BusinessStaffRole } from '../src/middleware/business-staff-role.enum';
import { AdminRole } from '../src/middleware/admin-role.enum';

jest.setTimeout(120000);

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

const PUBLIC_ROUTE_PATTERNS = [/^\/api\/business\/[^/]+\/services$/];

// ─── helpers ──────────────────────────────────────────────────────────────────

async function signupUser(
  app: INestApplication,
  userRepo: Repository<User>,
  email: string,
  password: string,
): Promise<{ userId: string; token: string }> {
  await request(app.getHttpServer()).post('/api/auth/get-started').send({ email });
  const dbUser = await userRepo.findOne({ where: { email } });
  await request(app.getHttpServer())
    .post('/api/auth/verify-code')
    .send({ email, code: dbUser?.verificationCode });
  const signupRes = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({
      email,
      password,
      firstName: 'Test',
      surname: 'User',
      phoneNumber: '+2348012345678',
      gender: 'FEMALE',
    });

  const loginRes = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });

  return { userId: loginRes.body.user.id, token: loginRes.body.token };
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('DEV-030 Role & Permission System (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;

  const password = 'TestPass123!';
  const ts = Date.now();
  const emails = {
    merchant: `merchant-${ts}@khs.test`,
    manager: `manager-${ts}@khs.test`,
    stylist: `stylist-${ts}@khs.test`,
    receptionist: `receptionist-${ts}@khs.test`,
    cashier: `cashier-${ts}@khs.test`,
    superAdmin: `superadmin-${ts}@khs.test`,
    admin: `admin-${ts}@khs.test`,
  };

  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

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

    // Sync schema for new columns added in DEV-030
    await dataSource.synchronize();

    // ── create all test users ──────────────────────────────────────────────

    for (const [key, email] of Object.entries(emails)) {
      const { userId, token } = await signupUser(app, userRepo, email, password);
      tokens[key] = token;
      userIds[key] = userId;
    }

    // ── assign roles directly in DB ────────────────────────────────────────

    // Merchant
    await userRepo.update(userIds.merchant, { isMerchant: true, isCustomer: false });

    // Business staff roles
    await userRepo.update(userIds.manager, {
      isBusinessStaff: true,
      businessStaffRole: BusinessStaffRole.MANAGER,
      isCustomer: false,
    });
    await userRepo.update(userIds.stylist, {
      isBusinessStaff: true,
      businessStaffRole: BusinessStaffRole.STYLIST,
      isCustomer: false,
    });
    await userRepo.update(userIds.receptionist, {
      isBusinessStaff: true,
      businessStaffRole: BusinessStaffRole.RECEPTIONIST,
      isCustomer: false,
    });
    await userRepo.update(userIds.cashier, {
      isBusinessStaff: true,
      businessStaffRole: BusinessStaffRole.CASHIER,
      isCustomer: false,
    });

    // Platform staff roles
    await userRepo.update(userIds.superAdmin, {
      isStaff: true,
      adminRole: AdminRole.SUPER_ADMIN,
      isCustomer: false,
    });
    await userRepo.update(userIds.admin, {
      isStaff: true,
      adminRole: AdminRole.ADMIN,
      isCustomer: false,
    });

    // Re-login everyone to get tokens with updated roles reflected in auth middleware
    for (const [key, email] of Object.entries(emails)) {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password });
      tokens[key] = loginRes.body.token;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        `DELETE FROM "user" WHERE email = ANY($1)`,
        [Object.values(emails)],
      );
    }
    await app?.close();
  });

  // ─── Role flag verification ────────────────────────────────────────────────

  describe('Role flags set correctly in DB', () => {
    it('merchant has isMerchant=true', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.merchant } });
      expect(u?.isMerchant).toBe(true);
      expect(u?.isBusinessStaff).toBe(false);
    });

    it('manager has isBusinessStaff=true and role=manager', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.manager } });
      expect(u?.isBusinessStaff).toBe(true);
      expect(u?.businessStaffRole).toBe(BusinessStaffRole.MANAGER);
    });

    it('stylist has isBusinessStaff=true and role=stylist', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.stylist } });
      expect(u?.isBusinessStaff).toBe(true);
      expect(u?.businessStaffRole).toBe(BusinessStaffRole.STYLIST);
    });

    it('receptionist has isBusinessStaff=true and role=receptionist', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.receptionist } });
      expect(u?.isBusinessStaff).toBe(true);
      expect(u?.businessStaffRole).toBe(BusinessStaffRole.RECEPTIONIST);
    });

    it('cashier has isBusinessStaff=true and role=cashier', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.cashier } });
      expect(u?.isBusinessStaff).toBe(true);
      expect(u?.businessStaffRole).toBe(BusinessStaffRole.CASHIER);
    });

    it('superAdmin has isStaff=true and adminRole=super_admin', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.superAdmin } });
      expect(u?.isStaff).toBe(true);
      expect(u?.adminRole).toBe(AdminRole.SUPER_ADMIN);
    });

    it('admin has isStaff=true and adminRole=admin', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.admin } });
      expect(u?.isStaff).toBe(true);
      expect(u?.adminRole).toBe(AdminRole.ADMIN);
    });
  });

  // ─── Unauthenticated access ────────────────────────────────────────────────

  describe('Unauthenticated access is blocked', () => {
    it('POST /api/business/getBookings without token → 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/business/getBookings');
      expect(res.status).toBe(401);
    });

    it('GET /api/business/getServices without token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/business/getServices');
      expect(res.status).toBe(401);
    });

    it('POST /api/business/addStaff without token → 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/business/addStaff');
      expect(res.status).toBe(401);
    });
  });

  // ─── Merchant — full access ────────────────────────────────────────────────

  describe('Merchant access (full business access)', () => {
    it('POST /api/business/getBookings → not 401/403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${tokens.merchant}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getServices → not 401/403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getServices')
        .set('Authorization', `Bearer ${tokens.merchant}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/owner-details → not 401/403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/owner-details')
        .set('Authorization', `Bearer ${tokens.merchant}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('POST /api/business/remove-categories → not 401/403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/remove-categories')
        .set('Authorization', `Bearer ${tokens.merchant}`)
        .send({ categoriesToRemove: [] });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // ─── MANAGER — broad access, blocked on owner-only routes ─────────────────

  describe('Manager permissions', () => {
    it('POST /api/business/getBookings (VIEW_BOOKINGS) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getTeamMembers (VIEW_STAFF) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getTeamMembers')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getServices (VIEW_SERVICES) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getServices')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/business-details (VIEW_REPORTS) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/business-details')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/owner-details → 403 (merchant-only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/owner-details')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).toBe(403);
    });

    it('POST /api/business/remove-categories → 403 (merchant-only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/remove-categories')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ categoriesToRemove: [] });
      expect(res.status).toBe(403);
    });

    it('DELETE /api/business/delete-service/any → 403 (merchant-only)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/business/delete-service/some-id')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── STYLIST — narrow access ───────────────────────────────────────────────

  describe('Stylist permissions', () => {
    it('POST /api/business/getBookings (VIEW_BOOKINGS) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${tokens.stylist}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getServices (VIEW_SERVICES) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getServices')
        .set('Authorization', `Bearer ${tokens.stylist}`);
      expect(res.status).not.toBe(403);
    });

    it('POST /api/business/addStaff (MANAGE_STAFF) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/addStaff')
        .set('Authorization', `Bearer ${tokens.stylist}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('POST /api/business/createService (MANAGE_SERVICES) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/createService')
        .set('Authorization', `Bearer ${tokens.stylist}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('GET /api/business/business-details (VIEW_REPORTS) → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/business-details')
        .set('Authorization', `Bearer ${tokens.stylist}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/business/owner-details → 403 (merchant-only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/owner-details')
        .set('Authorization', `Bearer ${tokens.stylist}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── RECEPTIONIST ──────────────────────────────────────────────────────────

  describe('Receptionist permissions', () => {
    it('POST /api/business/getBookings (VIEW_BOOKINGS) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${tokens.receptionist}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getTeamMembers (VIEW_STAFF) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getTeamMembers')
        .set('Authorization', `Bearer ${tokens.receptionist}`);
      expect(res.status).not.toBe(403);
    });

    it('POST /api/business/addStaff (MANAGE_STAFF) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/addStaff')
        .set('Authorization', `Bearer ${tokens.receptionist}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('POST /api/business/createService (MANAGE_SERVICES) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/createService')
        .set('Authorization', `Bearer ${tokens.receptionist}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('GET /api/business/business-details (VIEW_REPORTS) → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/business-details')
        .set('Authorization', `Bearer ${tokens.receptionist}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── CASHIER ───────────────────────────────────────────────────────────────

  describe('Cashier permissions', () => {
    it('POST /api/business/getBookings (VIEW_BOOKINGS) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${tokens.cashier}`);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/business/getServices (VIEW_SERVICES) → not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getServices')
        .set('Authorization', `Bearer ${tokens.cashier}`);
      expect(res.status).not.toBe(403);
    });

    it('POST /api/business/addStaff (MANAGE_STAFF) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/addStaff')
        .set('Authorization', `Bearer ${tokens.cashier}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('POST /api/business/createService (MANAGE_SERVICES) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/createService')
        .set('Authorization', `Bearer ${tokens.cashier}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('GET /api/business/getTeamMembers (VIEW_STAFF) → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getTeamMembers')
        .set('Authorization', `Bearer ${tokens.cashier}`);
      expect(res.status).toBe(403);
    });

    it('POST /api/business/acceptBooking/id (MANAGE_BOOKINGS) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/acceptBooking/some-id')
        .set('Authorization', `Bearer ${tokens.cashier}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── CUSTOMER — blocked from all business staff routes ────────────────────

  describe('Customer blocked from business staff routes', () => {
    let customerToken: string;

    beforeAll(async () => {
      const email = `customer-${ts}@khs.test`;
      const { token } = await signupUser(app, userRepo, email, password);
      customerToken = token;
    });

    afterAll(async () => {
      await dataSource.query(`DELETE FROM "user" WHERE email = $1`, [
        `customer-${ts}@khs.test`,
      ]);
    });

    it('POST /api/business/getBookings → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/business/getBookings')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/business/getTeamMembers → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/getTeamMembers')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin level guard ─────────────────────────────────────────────────────

  describe('Admin level — isStaff flag', () => {
    it('superAdmin has isStaff=true and adminRole=super_admin in DB', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.superAdmin } });
      expect(u?.isStaff).toBe(true);
      expect(u?.adminRole).toBe(AdminRole.SUPER_ADMIN);
    });

    it('regular admin has isStaff=true and adminRole=admin in DB', async () => {
      const u = await userRepo.findOne({ where: { id: userIds.admin } });
      expect(u?.isStaff).toBe(true);
      expect(u?.adminRole).toBe(AdminRole.ADMIN);
    });

    it('superAdmin can access merchant-level business routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/owner-details')
        .set('Authorization', `Bearer ${tokens.superAdmin}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('regular admin can access merchant-level business routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/business/owner-details')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
