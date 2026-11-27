import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ComboItem } from './combo-item.entity';

@Entity('combos')
export class Combo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  combo_price: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  original_price: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url?: string | null;

  @Column({ type: 'datetime', nullable: true })
  start_date?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  end_date?: Date | null;

  @Column({ type: 'int', nullable: true })
  max_quantity?: number | null;

  @Column({ type: 'int', default: 0 })
  sold_count: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => ComboItem, (item) => item.combo, {
    cascade: true,
    eager: true,
  })
  items: ComboItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

