import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from 'src/business/entities/business.entity';

export type IntegrationProvider = 'google-calendar' | 'zohobooks';

interface OAuthStatePayload {
  purpose: 'integration-oauth';
  provider: IntegrationProvider;
  businessId: string;
  ownerId: string;
}

// Shared guard rails for the integration controllers: a merchant may only touch
// their own salon, and the OAuth `state` that round-trips through Google/Zoho is
// signed, tied to the merchant who started it, and short-lived.
@Injectable()
export class IntegrationAccessService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly jwtService: JwtService,
  ) {}

  // Domain-separated from login tokens so a login token can never pass as OAuth
  // state (or the reverse).
  private get stateSecret(): string {
    return `${process.env.JWT_ACCESS_SECRET}:integration-oauth`;
  }

  async assertOwnsBusiness(ownerId: string, businessId: string): Promise<void> {
    if (!ownerId || !businessId) {
      throw new ForbiddenException('You can only manage your own salon.');
    }
    const owns = await this.businessRepo.existsBy({ id: businessId, ownerId });
    if (!owns) {
      throw new ForbiddenException('You can only manage your own salon.');
    }
  }

  signState(
    provider: IntegrationProvider,
    businessId: string,
    ownerId: string,
  ): string {
    const payload: OAuthStatePayload = {
      purpose: 'integration-oauth',
      provider,
      businessId,
      ownerId,
    };
    return this.jwtService.sign(payload, {
      secret: this.stateSecret,
      expiresIn: '15m',
    });
  }

  // Returns the business the merchant started connecting; throws if the state is
  // forged, expired, for another provider, or started by someone else.
  verifyState(
    provider: IntegrationProvider,
    state: string,
    ownerId: string,
  ): string {
    let payload: OAuthStatePayload;
    try {
      payload = this.jwtService.verify<OAuthStatePayload>(state, {
        secret: this.stateSecret,
      });
    } catch {
      throw new BadRequestException(
        'The connection request expired or is invalid. Please try connecting again.',
      );
    }
    if (
      payload.purpose !== 'integration-oauth' ||
      payload.provider !== provider ||
      payload.ownerId !== ownerId
    ) {
      throw new BadRequestException(
        'The connection request expired or is invalid. Please try connecting again.',
      );
    }
    return payload.businessId;
  }
}
