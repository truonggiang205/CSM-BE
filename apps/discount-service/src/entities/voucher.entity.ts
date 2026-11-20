import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DiscountType {
  FIXED_AMOUNT = 'FIXED_AMOUNT', // Giảm tiền trực tiếp (VD: giảm 20.000₫)
  PERCENTAGE = 'PERCENTAGE',     // Giảm theo % (VD: giảm 10%)
}

@Entity('vouchers')
@Index(['is_active', 'start_date', 'end_date'])
export class Voucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string; // VD: CSM20K, WELCOME

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ type: 'enum', enum: DiscountType, default: DiscountType.FIXED_AMOUNT })
  discount_type: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discount_value: number; // 20000 nếu là FIXED_AMOUNT, hoặc 10 (tức 10%) nếu là PERCENTAGE

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  min_order_value: number; // Đơn tối thiểu để áp dụng

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  max_discount_amount: number; // Mức giảm tối đa (khi dùng theo %)

  @Column({ type: 'int', default: 100 })
  usage_limit: number; // Lượt dùng tối đa

  @Column({ type: 'int', default: 0 })
  used_count: number; // Số lượt đã dùng

  @Column({ type: 'datetime' })
  start_date: Date;

  @Column({ type: 'datetime' })
  end_date: Date;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}