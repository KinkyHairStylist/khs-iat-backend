import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * DEV-051: Auth guard restoration e2e tests.
 *
 * Verifies that each previously-unguarded controller now rejects unauthenticated
 * requests with 401. A 401 proves JwtAuthGuard is active; before DEV-051 these
 * routes were fully open.
 *
 * Run with: NODE_ENV=test npm run test:e2e -- --testPathPattern=auth-guards
 */

describe('Auth Guards (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function get(path: string) {
    return request(app.getHttpServer()).get(path);
  }

  function post(path: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer()).post(path).send(body);
  }

  // ── Business Wallet ──────────────────────────────────────────────────────────
  describe('BusinessWalletController — GET /api/business-wallet/wallet', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/business-wallet/wallet');
      expect(res.status).toBe(401);
    });
  });

  // ── Reviews ──────────────────────────────────────────────────────────────────
  describe('ReviewController — GET /api/reviews/client/:clientId', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/reviews/client/some-id');
      expect(res.status).toBe(401);
    });
  });

  // ── Reminders ────────────────────────────────────────────────────────────────
  describe('ReminderController — POST /api/reminders/send', () => {
    it('returns 401 without a token', async () => {
      const res = await post('/api/reminders/send', {});
      expect(res.status).toBe(401);
    });
  });

  // ── Promotions ───────────────────────────────────────────────────────────────
  describe('PromotionController — POST /api/promotions/send', () => {
    it('returns 401 without a token', async () => {
      const res = await post('/api/promotions/send', {});
      expect(res.status).toBe(401);
    });
  });

  // ── Custom Messages ──────────────────────────────────────────────────────────
  describe('CustomMessageController — POST /api/custom-messages/send-email', () => {
    it('returns 401 without a token', async () => {
      const res = await post('/api/custom-messages/send-email', {});
      expect(res.status).toBe(401);
    });
  });

  // ── Communications ───────────────────────────────────────────────────────────
  describe('CommunicationController — POST /api/communications/send-direct-message', () => {
    it('returns 401 without a token', async () => {
      const res = await post('/api/communications/send-direct-message', {});
      expect(res.status).toBe(401);
    });
  });

  // ── Clients ──────────────────────────────────────────────────────────────────
  describe('ClientController — GET /api/clients', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/clients');
      expect(res.status).toBe(401);
    });
  });

  // ── Business Settings ────────────────────────────────────────────────────────
  describe('BusinessSettingsController — GET /api/business-settings/profile', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/business-settings/profile');
      expect(res.status).toBe(401);
    });
  });

  // ── Business Owner Settings ──────────────────────────────────────────────────
  describe('BusinessOwnerSettingsController — GET /api/business-owner-settings/owner', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/business-owner-settings/owner');
      expect(res.status).toBe(401);
    });
  });

  // ── Business Gift Cards ──────────────────────────────────────────────────────
  describe('BusinessGiftCardsController — GET /api/business-gift-cards/list', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/business-gift-cards/list');
      expect(res.status).toBe(401);
    });
  });

  // ── Bookings ─────────────────────────────────────────────────────────────────
  describe('BookingController — GET /api/bookings/me', () => {
    it('returns 401 without a token', async () => {
      const res = await get('/api/bookings/me');
      expect(res.status).toBe(401);
    });
  });
});
