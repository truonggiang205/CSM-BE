import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { HomeSection } from './home-section.entity';
import { Product } from './product.entity';

@Entity('home_section_items')
export class HomeSectionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  section_id: string;

  @ManyToOne(() => HomeSection, (section) => section.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: HomeSection;

  @Column({ type: 'varchar', length: 36 })
  product_id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  /** Ghi chú hiển thị kèm sản phẩm, ví dụ lời giới thiệu ở khối CSM Picks */
  @Column({ length: 255, nullable: true })
  note: string | null;
}
