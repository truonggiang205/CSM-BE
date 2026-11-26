import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column()
  product_id: string;

  @Column()
  product_name_snapshot: string; // Denormalization

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price_snapshot: number; // Denormalization

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 20, default: 'PRODUCT' })
  item_type?: 'PRODUCT' | 'COMBO';

  @Column({ type: 'varchar', length: 100, nullable: true })
  combo_id?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  combo_items_snapshot?: Array<{
    productId: string;
    productName: string;
    quantity: number;
  }> | null;

  @CreateDateColumn()
  created_at: Date;
}
