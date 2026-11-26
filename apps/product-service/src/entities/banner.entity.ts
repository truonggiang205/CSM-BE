import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Banner hiển thị ở slider đầu trang chủ.
 * branch_id = NULL nghĩa là banner áp dụng cho toàn chuỗi (chỉ ADMIN quản lý).
 */
@Entity('banners')
@Index(['branch_id', 'is_active', 'sort_order'])
export class Banner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'varchar', length: 36, nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
