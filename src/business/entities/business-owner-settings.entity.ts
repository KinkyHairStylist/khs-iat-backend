// business-owner-settings.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';

// Embedded types for nested objects
export class ReminderRule {
  @Column()
  messageType: string;

  @Column()
  reminderHoursBeforeAppointment: number;

  @Column({ type: 'text' })
  reminderMessage: string;
}

export class BusinessNotifications {
  @Column({ default: false })
  newBookingAlerts: boolean;

  @Column({ default: false })
  cancellationAlerts: boolean;

  @Column({ default: false })
  dailySummaryReports: boolean;
}

export class NotificationSettings {
  @Column({ default: false })
  enableAutomatedReminders: boolean;

  @Column({ type: 'jsonb', nullable: true })
  reminderRules: ReminderRule[];

  @Column(() => BusinessNotifications)
  businessNotifications: BusinessNotifications;
}

export class BookingRules {
  @Column({ type: 'int', default: 24 })
  minimumLeadTimeHours: number;

  @Column({ type: 'int', default: 0 })
  bufferTimeBetweenAppointmentsMinutes: number;

  @Column({ type: 'int', default: 90 })
  maximumAdvanceBookingDays: number;

  @Column({ type: 'varchar', nullable: true })
  sameDayBookingCutoff: string;

  @Column({ default: false })
  enableWaitlist: boolean;

  @Column({ default: false })
  autoNotifyWaitlist: boolean;

  @Column({ default: false })
  allowDoubleBookings: boolean;
}

export class ClientManagement {
  @Column({ type: 'int', default: 3 })
  noShowLimit: number;

  @Column({ type: 'int', default: 30 })
  restrictionPeriodDays: number;

  @Column({ default: false })
  requirePhoneVerification: boolean;

  @Column({ default: true })
  allowGuestBooking: boolean;

  @Column({ default: false })
  collectClientFeedback: boolean;

  @Column({ default: false })
  weeklyNoShowReports: boolean;

  @Column({ default: false })
  clientNoShowPattern: boolean;

  @Column({ type: 'jsonb', nullable: true })
  reportRecipients: string[];
}

export class OnlinePresence {
  @Column({ default: false, nullable: true })
  enableOnlineBooking: boolean;

  @Column({ type: 'text', nullable: true })
  bookingPageUrl: string;

  @Column({ type: 'text', nullable: true })
  websiteEmbedCode: string;

  @Column({ type: 'text', nullable: true })
  seoBusinessDescription: string;

  @Column({ type: 'text', nullable: true })
  seoPrimaryColor: string;

  @Column({ type: 'text', nullable: true })
  seoAccentColor: string;
}

export class Integrations {
  @Column({ default: false, nullable: true })
  googleCalendar: boolean;

  @Column({ default: false, nullable: true })
  mailChimp: boolean;

  @Column({ default: false, nullable: true })
  zohoBooks: boolean;
}

export class PricingPolicies {
  @Column({ type: 'int', default: 24, nullable: true })
  cancellationWindow: number;

  @Column({ type: 'int', default: 5, nullable: true })
  cancellationFee: number;

  @Column({ type: 'text', default: '%', nullable: true })
  cancellationFeeType: string;

  @Column({ type: 'int', default: 10, nullable: true })
  noShowFee: number;

  @Column({ type: 'text', default: '%', nullable: true })
  noShowFeeType: string;

  @Column({ default: false, nullable: true })
  depositRequired: boolean;

  @Column({ type: 'int', default: 25, nullable: true })
  depositPercentageRequired: number;

  @Column({ type: 'text', nullable: true })
  cancellationPolicyText: string;

  @Column({ default: false, nullable: true })
  acceptCardPayment: boolean;

  @Column({ default: false, nullable: true })
  acceptCashPayment: boolean;
}

@Entity('business_owner_settings')
export class BusinessOwnerSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'uuid' })
  @Index()
  businessId: string;

  @Column({ type: 'text', nullable: true })
  @Index()
  apiKey: string;

  @OneToOne(() => Business, (business) => business.ownerSettings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column(() => NotificationSettings)
  notifications: NotificationSettings;

  @Column(() => BookingRules)
  bookingRules: BookingRules;

  @Column(() => ClientManagement)
  clientManagement: ClientManagement;

  @Column(() => OnlinePresence)
  onlinePresence: OnlinePresence;

  @Column(() => PricingPolicies)
  pricingPolicies: PricingPolicies;

  @Column(() => Integrations)
  integrations: Integrations;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
