import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('spin_history')
@Index(['user_id', 'spin_date'], { unique: true })
export class SpinHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  user_id: string;

  @Column({ type: 'varchar', length: 10 })
  spin_date: string;

  @Column({ type: 'varchar', length: 50 })
  prize_id: string;

  @Column({ type: 'varchar', length: 100 })
  prize_label: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  voucher_code?: string | null;

  @CreateDateColumn()
  created_at: Date;
}
