import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Combo } from './combo.entity';

@Entity('combo_items')
@Index(['combo_id', 'product_id'])
export class ComboItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  combo_id: string;

  @ManyToOne(() => Combo, (combo) => combo.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'combo_id' })
  combo: Combo;

  @Column({ type: 'varchar', length: 100 })
  product_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  product_name?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  product_image?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  original_price: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;
}

