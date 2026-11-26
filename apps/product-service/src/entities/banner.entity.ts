import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Vị trí hiển thị banner:
 * - HOME_HERO: slider đầu trang chủ
 * - PRODUCTS_TOP: dải banner đầu trang Tất cả sản phẩm
 * - CART: banner trong trang Giỏ hàng
 * - POPUP: popup khuyến mãi khi khách vào web (tối đa 1 lần/ngày)
 */
export const BANNER_PLACEMENTS = ['HOME_HERO', 'PRODUCTS_TOP', 'CART', 'POPUP'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/**
 * Banner hiển thị ở slider đầu trang chủ.
 * branch_id = NULL nghĩa là banner áp dụng cho toàn chuỗi (chỉ ADMIN quản lý).
 */
@Entity('banners')
@Index(['placement', 'branch_id', 'is_active', 'sort_order'])
export class Banner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, default: 'HOME_HERO' })
  placement: BannerPlacement;

  @Column({ length: 150 })
  title: string;

  @Column({ length: 150, nullable: true })
  highlight: string | null;

  @Column({ length: 80, nullable: true })
  badge: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 500 })
  image_url: string;

  @Column({ length: 500, nullable: true })
  link_url: string | null;

  @Column({ length: 60, nullable: true })
  cta_text: string | null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'datetime', nullable: true })
  start_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  end_at: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branch_id: string | null;

  /** Số lượt khách bấm vào banner (đo hiệu quả) */
  @Column({ type: 'int', default: 0 })
  click_count: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
