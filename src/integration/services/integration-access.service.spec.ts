import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IntegrationAccessService } from './integration-access.service';

describe('IntegrationAccessService', () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  let jwt: JwtService;
  let businessRepo: { existsBy: jest.Mock };
  let service: IntegrationAccessService;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = previousSecret;
  });

  beforeEach(() => {
    jwt = new JwtService({ secret: 'test-secret' });
    businessRepo = { existsBy: jest.fn() };
    service = new IntegrationAccessService(businessRepo as any, jwt);
  });

  describe('assertOwnsBusiness', () => {
    it('lets the owner through', async () => {
      businessRepo.existsBy.mockResolvedValue(true);
      await expect(service.assertOwnsBusiness('owner-1', 'biz-1')).resolves.toBeUndefined();
      expect(businessRepo.existsBy).toHaveBeenCalledWith({ id: 'biz-1', ownerId: 'owner-1' });
    });

    it("refuses someone else's salon", async () => {
      businessRepo.existsBy.mockResolvedValue(false);
      await expect(service.assertOwnsBusiness('owner-2', 'biz-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses missing ids without querying', async () => {
      await expect(service.assertOwnsBusiness('', 'biz-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(businessRepo.existsBy).not.toHaveBeenCalled();
    });
  });

  describe('OAuth state', () => {
    it('round-trips for the merchant who started it', () => {
      const state = service.signState('google-calendar', 'biz-1', 'owner-1');
      expect(service.verifyState('google-calendar', state, 'owner-1')).toBe('biz-1');
    });

    it('is refused for a different merchant', () => {
      const state = service.signState('google-calendar', 'biz-1', 'owner-1');
      expect(() => service.verifyState('google-calendar', state, 'owner-2')).toThrow(
        BadRequestException,
      );
    });

    it('is refused for a different provider', () => {
      const state = service.signState('google-calendar', 'biz-1', 'owner-1');
      expect(() => service.verifyState('zohobooks', state, 'owner-1')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a plain business id, which is what the old flow sent', () => {
      expect(() => service.verifyState('google-calendar', 'biz-1', 'owner-1')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a login token used as state', () => {
      const loginToken = jwt.sign({ sub: 'owner-1' });
      expect(() => service.verifyState('google-calendar', loginToken, 'owner-1')).toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired state', () => {
      const expired = jwt.sign(
        { purpose: 'integration-oauth', provider: 'google-calendar', businessId: 'biz-1', ownerId: 'owner-1' },
        { secret: `${process.env.JWT_ACCESS_SECRET}:integration-oauth`, expiresIn: -10 },
      );
      expect(() => service.verifyState('google-calendar', expired, 'owner-1')).toThrow(
        BadRequestException,
      );
    });
  });
});
