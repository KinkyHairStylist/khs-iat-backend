import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettingsEntity } from './entities/platform-settings.entity';
import {
  UpdateGeneralSettingsDto,
  UpdateNotificationSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateFeaturesSettingsDto,
  UpdateIntegrationsSettingsDto,
} from './DTOs/platform-settings.dto';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSettingsEntity)
    private readonly repo: Repository<PlatformSettingsEntity>,
  ) {}

  /** Default settings configuration */
  private getDefaultSettings(): PlatformSettingsEntity {
    const settings = new PlatformSettingsEntity();
    settings.general = {
      platformName: 'Kinky Hair Stylist',
      platformUrl: 'https://kinkyhairstylist.com',
      platformDescription: 'Hair styling platform',
      supportEmail: 'support@kinkyhairstylist.com',
      contactPhone: '',
      userRegistration: true,
      businessRegistration: true,
      maintenanceMode: false,
    };
    settings.notifications = {
      email: {
        newUserRegistration: true,
        businessApplications: true,
        paymentFailures: true,
        systemAlerts: true,
      },
      push: {
        supportTickets: true,
        contentReports: true,
      },
    };
    settings.payments = {
      platformFee: 5, // Default 5% platform fee
      minWithdrawal: 10,
      methods: {
        creditCard: true,
        paypal: false,
        bankTransfers: true,
      },
      payoutSchedule: 'Weekly',
    };
    settings.features = {
      user: {
        reviewsAndRatings: true,
        giftCards: true,
        loyaltyProgram: false,
        referralSystem: true,
      },
      business: {
        onlineBooking: true,
        staffManagement: true,
        inventoryManagement: false,
      },
    };
    settings.integrations = {
      paymentGateways: {
        stripe: { enabled: false, key: '', description: '' },
        paypal: { enabled: false, key: '', description: '' },
      },
      communication: {
        twilio: { enabled: false, key: '', description: '' },
        sendgrid: { enabled: false, key: '', description: '' },
      },
    };
    return settings;
  }

  /** Fetch settings or create default if none found */
  private async getSettings() {
    let settings = await this.repo.findOne({ where: {} });
    if (!settings) {
      // Create default settings if none exist
      settings = this.getDefaultSettings();
      settings = await this.repo.save(settings);
    }
    return settings;
  }

  /** ---------------- GENERAL ---------------- */
  async getGeneral() {
    const s = await this.getSettings();
    return s.general;
  }

  async updateGeneral(dto: UpdateGeneralSettingsDto) {
    const s = await this.getSettings();
    s.general = { ...s.general, ...dto };
    return this.repo.save(s);
  }

  /** ---------------- NOTIFICATIONS ---------------- */
  async getNotifications() {
    const s = await this.getSettings();
    return s.notifications;
  }

  async updateNotifications(dto: UpdateNotificationSettingsDto) {
    const s = await this.getSettings();
    s.notifications = {
      email: { ...s.notifications.email, ...(dto.email || {}) },
      push: { ...s.notifications.push, ...(dto.push || {}) },
    };
    return this.repo.save(s);
  }

  /** ---------------- PAYMENTS ---------------- */
  async getPayments() {
    const s = await this.getSettings();
    return s.payments;
  }

  async updatePayments(dto: UpdatePaymentSettingsDto) {
    const s = await this.getSettings();
    s.payments = {
      ...s.payments,
      ...dto,
      methods: { ...s.payments.methods, ...(dto.methods || {}) },
    };
    return this.repo.save(s);
  }

  /** ---------------- FEATURES ---------------- */
  async getFeatures() {
    const s = await this.getSettings();
    return s.features;
  }

  async updateFeatures(dto: UpdateFeaturesSettingsDto) {
    const s = await this.getSettings();
    s.features = {
      user: { ...s.features.user, ...(dto.user || {}) },
      business: { ...s.features.business, ...(dto.business || {}) },
    };
    return this.repo.save(s);
  }

  /** ---------------- INTEGRATIONS ---------------- */
  async getIntegrations() {
    const s = await this.getSettings();
    return s.integrations;
  }

  async updateIntegrations(dto: UpdateIntegrationsSettingsDto) {
  const s = await this.getSettings();

  s.integrations = {
    paymentGateways: {
      stripe: {
        enabled: dto.paymentGateways?.stripe?.enabled ?? s.integrations.paymentGateways.stripe.enabled,
        key: dto.paymentGateways?.stripe?.key ?? s.integrations.paymentGateways.stripe.key,
        description: dto.paymentGateways?.stripe?.description ?? s.integrations.paymentGateways.stripe.description,
      },
      paypal: {
        enabled: dto.paymentGateways?.paypal?.enabled ?? s.integrations.paymentGateways.paypal.enabled,
        key: dto.paymentGateways?.paypal?.key ?? s.integrations.paymentGateways.paypal.key,
        description: dto.paymentGateways?.paypal?.description ?? s.integrations.paymentGateways.paypal.description,
      },
    },
    communication: {
      twilio: {
        enabled: dto.communication?.twilio?.enabled ?? s.integrations.communication.twilio.enabled,
        key: dto.communication?.twilio?.key ?? s.integrations.communication.twilio.key,
        description: dto.communication?.twilio?.description ?? s.integrations.communication.twilio.description,
      },
      sendgrid: {
        enabled: dto.communication?.sendgrid?.enabled ?? s.integrations.communication.sendgrid.enabled,
        key: dto.communication?.sendgrid?.key ?? s.integrations.communication.sendgrid.key,
        description: dto.communication?.sendgrid?.description ?? s.integrations.communication.sendgrid.description,
      },
    },
  };

  return this.repo.save(s);
}

}
