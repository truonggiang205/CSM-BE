import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { HomeSectionItem } from './home-section-item.entity';

export const HOME_SECTION_TYPES = ['FLASH_SALE', 'CSM_PICKS', 'NEW_ARRIVALS'] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

/**
 * Khối sản phẩm nổi bật trên trang chủ (Flash Sale, CSM Picks, Hàng mới).
 * Mỗi cặp (type, branch_id) có tối đa 1 bản ghi; branch_id = NULL là cấu hình toàn chuỗi.
 */
@Entity('home_sections')
@Index(['type', 'branch_id'])
export class HomeSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  type: HomeSectionType;

  @Column({ length: 150, nullable: true })
  title: string | null;

  @Column({ length: 255, nullable: true })
  subtitle: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'datetime', nullable: true })
  start_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  end_at: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branch_id: string | null;

  @OneToMany(() => HomeSectionItem, (item) => item.section)
  items: HomeSectionItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
