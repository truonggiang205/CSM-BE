import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Branch } from './branch.entity';

@Entity('stocks')
@Unique(['product_id', 'branch_id']) // Một sản phẩm ở 1 chi nhánh chỉ có 1 dòng stock
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  product_id: string;

  @Column()
  branch_id: string;

  @ManyToOne(() => Branch, (branch) => branch.stocks)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  reserved_quantity: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
