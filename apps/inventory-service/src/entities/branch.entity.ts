import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Stock } from './stock.entity';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) => (value !== null && value !== undefined ? parseFloat(value) : null),
    },
  })
  latitude: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) => (value !== null && value !== undefined ? parseFloat(value) : null),
    },
  })
  longitude: number | null;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => Stock, (stock) => stock.branch)
  stocks: Stock[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

