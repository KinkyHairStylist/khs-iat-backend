import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DEFAULTPRODUCTCATEGORIES } from '../enum/marketplace.enum';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';

@Entity('platform_inventory')
export class PlatformInventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Total revenue across all businesses and products',
  })
  totalRevenue: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment:
      'Total inventory value across all products (cost price * quantity)',
  })
  totalInventoryValue: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total stock quantity across all products',
  })
  totalStock: number;

  @Column({
    type: 'enum',
    enum: WalletCurrency,
    default: WalletCurrency.AUD,
    nullable: true,
  })
  currency: WalletCurrency;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Count of all products with low stock across platform',
  })
  lowStockItemsCount: number;

  @Column({
    type: 'jsonb',
    default: DEFAULTPRODUCTCATEGORIES,
    comment: 'List of available product categories for the platform',
  })
  categoriesList: string[];

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of products on the platform',
  })
  totalProducts: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of businesses on the platform',
  })
  totalBusinesses: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of active products',
  })
  activeProducts: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of out-of-stock products',
  })
  outOfStockProducts: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Category-wise breakdown of products',
  })
  categoryBreakdown: {
    category: string;
    totalProducts: number;
    totalStock: number;
    totalValue: number;
  }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
