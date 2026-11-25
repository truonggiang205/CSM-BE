import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Voucher } from './voucher.entity';

export enum UsageStatus {
  USED = 'USED',         // Đã sử dụng thành công
  REFUNDED = 'REFUNDED', // Đã được hoàn lại (do huỷ đơn hoặc rollback)
}

@Entity('voucher_usages')
@Index(['voucher_id', 'user_id'])
@Index(['order_id'])
export class VoucherUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  voucher_id: string;

  @ManyToOne(() => Voucher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voucher_id' })
  voucher: Voucher;

  @Column()
  user_id: string;

  @Column()
  order_id: string;

  @Column({ type: 'enum', enum: UsageStatus, default: UsageStatus.USED })
  status: UsageStatus;

  @CreateDateColumn()
  created_at: Date;
}
