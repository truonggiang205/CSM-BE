import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export const ANNOUNCEMENT_TONES = ['primary', 'accent', 'danger', 'info', 'dark'] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

/**
 * Thanh thông báo trên cùng của website (ví dụ: "Freeship đơn từ 100k").
 * branch_id = NULL là thông báo toàn chuỗi (ADMIN), có giá trị là của chi nhánh (BRANCH_MANAGER).
 */
@Entity('announcements')
@Index(['branch_id', 'is_active', 'sort_order'])
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  message: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  link_url: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  link_text: string | null;

  @Column({ type: 'varchar', length: 20, default: 'primary' })
  tone: AnnouncementTone;

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
