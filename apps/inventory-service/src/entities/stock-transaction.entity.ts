import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT',
  RESERVE = 'RESERVE',
  CANCEL_RESERVE = 'CANCEL_RESERVE',
}

@Entity('stock_transactions')
@Index(['reference_id', 'stock_id', 'type'], { unique: true })
export class StockTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stock_id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ nullable: true })
  reference_id: string; // ví dụ: order_id

  @CreateDateColumn()
  created_at: Date;
}
