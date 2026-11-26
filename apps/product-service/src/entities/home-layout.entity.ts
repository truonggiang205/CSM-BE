import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/** Các khối có thể sắp xếp/bật tắt trên trang chủ (lời chào và slider banner luôn ở đầu trang). */
export const HOME_BLOCK_KEYS = [
  'QUICK_MEAL',
  'FLASH_SALE',
  'CSM_PICKS',
  'NEW_ARRIVALS',
  'COMBO',
  'SPIN_WHEEL',
  'CATEGORIES',
  'FEATURED_PRODUCTS',
  'WHY_CHOOSE_US',
  'TESTIMONIALS',
] as const;
export type HomeBlockKey = (typeof HOME_BLOCK_KEYS)[number];

export interface HomeLayoutBlock {
  key: HomeBlockKey;
  visible: boolean;
}

/** Bố cục trang chủ của một phạm vi (branch_id = NULL là toàn chuỗi). */
@Entity('home_layouts')
@Index(['branch_id'])
export class HomeLayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branch_id: string | null;

  @Column({ type: 'simple-json' })
  blocks: HomeLayoutBlock[];

  @Column({ type: 'varchar', length: 36, nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
