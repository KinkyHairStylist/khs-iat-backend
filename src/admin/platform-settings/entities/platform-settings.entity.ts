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
    platformFee: number;
    minWithdrawal: number;
    methods: {
      creditCard: boolean;
      paypal: boolean;
      bankTransfers: boolean;
    };
    payoutSchedule: 'Weekly' | 'Bi-Weekly' | 'Monthly';
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

