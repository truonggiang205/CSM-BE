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
import { FlashSaleCampaign } from './flash-sale-campaign.entity';

@Entity('flash_sale_items')
@Index(['campaign_id', 'product_id'])
export class FlashSaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  campaign_id: string;

  @ManyToOne(() => FlashSaleCampaign, (campaign) => campaign.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: FlashSaleCampaign;

  @Column({ type: 'varchar', length: 100 })
  product_id: string;

  @Column({ type: 'varchar', length: 255 })
  product_name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  product_image: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  original_price: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  sale_price: number;

  @Column({ type: 'int', default: 0 })
  discount_percentage: number;

  @Column({ type: 'int', default: 50 })
  quantity_limit: number;

  @Column({ type: 'int', default: 0 })
  sold_count: number;

  @Column({ type: 'int', default: 2 })
  max_per_user: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
