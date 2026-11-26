import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { FlashSaleItem } from './flash-sale-item.entity';

@Entity('flash_sale_campaigns')
export class FlashSaleCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'date', nullable: true })
  apply_date: string;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  banner_url: string;

  @OneToMany(() => FlashSaleItem, (item) => item.campaign, {
    cascade: true,
    eager: true,
  })
  items: FlashSaleItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
