import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('transaction_fee_config_history')
export class TransactionFeeConfigHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  configId: string; // references the TransactionFeeConfig.id

  @Column({ type: 'uuid' })
  updatedBy: string; // the user id

  @Column({ type: 'jsonb' })
  changes: Record<string, { before: any; after: any }>; // what changed

  @CreateDateColumn()
  createdAt: Date;
}