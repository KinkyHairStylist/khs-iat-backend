import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert } from 'typeorm';

@Entity()
export class ModerationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('simple-array')
  bannedWords: string[];

  @Column({ default: true })
  Reviews: boolean;

  @Column({ default: true })
  UserProfile: boolean;

  @Column({ type: 'boolean', default: false })
  businessProfile: boolean;

  @Column({ type: 'boolean', default: false })
  images: boolean;
}
