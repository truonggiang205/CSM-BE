import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum FlashSalePurchaseStatus {
  /** Đã giữ suất cho đơn hàng (tính vào sold_count và giới hạn mỗi khách). */
  RESERVED = 'RESERVED',
  /** Đơn bị huỷ / rollback: suất đã được trả lại cho ca sale. */
  RELEASED = 'RELEASED',
}

/**
 * Nhật ký suất Giờ Vàng đã cấp cho từng đơn hàng.
 * Dùng để: giới hạn số suất mỗi khách trong một ca, hoàn đúng suất về đúng ca khi huỷ đơn
 * (kể cả khi ca đã kết thúc), và chống cấp trùng khi order-service gọi lại (idempotent theo order_id).
 */
@Entity('flash_sale_purchases')
@Index(['order_id'])
@Index(['user_id', 'flash_sale_item_id'])
export class FlashSalePurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  order_id: string;

  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 36 })
  campaign_id: string;

  @Column({ type: 'varchar', length: 36 })
  flash_sale_item_id: string;

  @Column({ type: 'varchar', length: 100 })
  product_id: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  sale_price: number;

  @Column({ type: 'varchar', length: 16, default: FlashSalePurchaseStatus.RESERVED })
  status: FlashSalePurchaseStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
