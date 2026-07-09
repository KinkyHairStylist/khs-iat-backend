import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../all_user_entities/user.entity';

@Entity()
export class UserNotificationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.notificationSettings, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // EMAIL NOTIFICATIONS
  @Column({ default: true })
  emailBookingConfirmations: boolean;

  @Column({ default: true })
  emailAppointmentReminders: boolean;

  @Column({ default: false })
  emailMarketingPromotions: boolean;

  @Column({ default: false })
  emailSpecialOffers: boolean;

  @Column({ default: false })
  emailNewSalonAlerts: boolean;

  // SMS NOTIFICATIONS
  @Column({ default: false })
  smsBookingConfirmations: boolean;

  @Column({ default: false })
  smsAppointmentReminders: boolean;

  @Column({ default: false })
  smsMarketingPromotions: boolean;

  @Column({ default: false })
  smsSpecialOffers: boolean;

  @Column({ default: false })
  smsNewSalonAlerts: boolean;
}