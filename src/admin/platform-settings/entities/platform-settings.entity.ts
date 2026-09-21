import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('platform_settings')
export class PlatformSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('jsonb', { default: {} })
  general: {
    platformName: string;
    platformUrl: string;
    platformDescription: string;
    supportEmail: string;
    contactPhone: string;
    userRegistration: boolean;
    businessRegistration: boolean;
    maintenanceMode: boolean;
  };

  @Column('jsonb', { default: {} })
  notifications: {
    email: {
      newUserRegistration: boolean;
      businessApplications: boolean;
      paymentFailures: boolean;
      systemAlerts: boolean;
    };
    push: {
      supportTickets: boolean;
      contentReports: boolean;
    };
  };

  @Column('jsonb', { default: {} })
  payments: {
    // Deprecated — superseded by acquisitionFeeTiers/commissionRate below
    // (Phase 1 fee-model split). Left in place so old rows still parse.
    platformFee: number;
    minWithdrawal: number;
    methods: {
      creditCard: boolean;
      paypal: boolean;
      bankTransfers: boolean;
    };
    payoutSchedule: 'Weekly' | 'Bi-Weekly' | 'Monthly';
    acquisitionFeeTiers: {
      Starter: number;
      Growth: number;
      Pro: number;
    };
    commissionRate: number;
    stripePassthroughRate: number;
    stripePassthroughFixedFee: number;
    // Cancellation money rules, platform-wide. Merchants only choose the
    // cancellation window (business_owner_settings). Late cancellations and
    // no-shows are the same case today: the amount collected is forfeited.
    // Merchant plans. Days of Trial offered at sign-up (not tied to a plan).
    trialDays: number;
    // The fee tier (Starter/Growth/Pro acquisition rate) merchants pay while on the
    // Trial, and while on MVP below.
    trialFeeTier: 'Starter' | 'Growth' | 'Pro';
    revealFeeTier: 'Starter' | 'Growth' | 'Pro';
    // MVP: a window with ONE shared end date: whoever joins late gets fewer days.
    // Admins can add days (extend), which also moves the end for merchants already in it.
    revealPeriod: {
      enabled: boolean;
      startsAt: string | null; // ISO
      endsAt: string | null; // ISO
    };
    earlyCancellationFee: number; // flat dollars withheld on an early cancellation
    lateCancellationStylistShare: number; // percent of a forfeited amount paid to the stylist; the rest is KHS's
    // priceId is the only value ever sent to Stripe — displayAmount is
    // read-only UI sugar so the settings screen can show "$29.99" without
    // a live Stripe round-trip. Never compute a charge from displayAmount.
    subscriptionPrices: {
      Starter: { priceId: string; displayAmount: number };
      Growth: { priceId: string; displayAmount: number };
      Pro: { priceId: string; displayAmount: number };
    };
  };

  @Column('jsonb', { default: {} })
  features: {
    user: {
      reviewsAndRatings: boolean;
      giftCards: boolean;
      loyaltyProgram: boolean;
      referralSystem: boolean;
    };
    business: {
      onlineBooking: boolean;
      staffManagement: boolean;
      inventoryManagement: boolean;
    };
  };

  @Column('jsonb', { default: {} })
  integrations: {
    paymentGateways: {
      stripe: { enabled: boolean; key: string; description: string };
      paypal: { enabled: boolean; key: string; description: string };
    };
    communication: {
      twilio: { enabled: boolean; key: string; description: string };
      sendgrid: { enabled: boolean; key: string; description: string };
    };
  };
}

