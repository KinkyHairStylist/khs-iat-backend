import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ShippingStatus } from '../enum/marketplace.enum';
import { Business } from '../../business/entities/business.entity';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';

@Entity('inventory_products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'uuid' })
  @Index()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.products, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  sellingPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPrice: number;

  @Column({
    type: 'enum',
    enum: WalletCurrency,
    default: WalletCurrency.AUD,
    nullable: true,
  })
  currency: WalletCurrency;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({
    type: 'enum',
    enum: ShippingStatus,
    default: ShippingStatus.NOT_SHIPPED,
  })
  shippingStatus: ShippingStatus;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Shipping progress percentage (0-100)',
  })
  shippingProgress: number;

  @Column({
    type: 'int',
    default: 0,
    nullable: true,
    comment: 'Shipping days',
  })
  shippingDays: number;

  @Column({
    type: 'int',
    default: 0,
    nullable: true,
    comment: 'Shipping orders',
  })
  shippingOrders: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  productImage: string;

  @Column({
    type: 'int',
    default: 10,
    comment: 'Threshold for low stock alert',
  })
  lowStockThreshold: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
