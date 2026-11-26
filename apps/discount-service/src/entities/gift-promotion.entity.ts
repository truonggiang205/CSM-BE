import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GiftRuleType = 'BUY_X_GET_Y' | 'MIN_ORDER_GIFT';

@Entity('gift_promotions')
export class GiftPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 30, default: 'BUY_X_GET_Y' })
  rule_type: GiftRuleType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  buy_product_id?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buy_product_name?: string | null;

  @Column({ type: 'int', default: 2 })
  buy_quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  min_order_amount?: number | null;

  @Column({ type: 'varchar', length: 100 })
  gift_product_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gift_product_name?: string | null;

  @Column({ type: 'int', default: 1 })
  gift_quantity: number;

  @Column({ type: 'int', default: 1 })
  max_gifts_per_order: number;

  @Column({ type: 'datetime', nullable: true })
  start_date?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  end_date?: Date | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
