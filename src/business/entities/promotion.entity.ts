import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { DISCOUNT_TYPE } from '../dtos/requests/PromotionDto';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientId: string;

  @Column({ nullable: true })
  businessId: string;

  @Column()
  clientName: string;

  @Column()
  clientEmail: string;

  @Column({ nullable: true })
  clientPhone: string;

  @Column({ nullable: true })
  discount: string;

  @Column()
  promotionTitle: string;

  @Column()
  promotionCode: string;

  @Column()
  expiryDate: string;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: DISCOUNT_TYPE,
    default: DISCOUNT_TYPE.PERCENTAGE,
  })
  discountType: DISCOUNT_TYPE;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
