import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items)
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

  @CreateDateColumn()
  created_at: Date;
}
