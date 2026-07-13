import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

export enum SupportedLanguage {
  ENGLISH = 'en',
  SPANISH = 'es',
  FRENCH = 'fr',
}

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({
    type: 'enum',
    enum: SupportedLanguage,
    default: SupportedLanguage.ENGLISH,
  })
  language: SupportedLanguage;

  @Column({ name: 'time_zone', default: 'UTC' })
  timeZone: string;

  @Column({ name: 'profile_visibility', default: true })
  profileVisibility: boolean; 

  @Column({ name: 'location_services', default: true })
  locationServices: boolean;
}
