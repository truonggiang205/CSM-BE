import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('wishlist_items')
@Index(['user_id', 'product_id'], { unique: true })
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  user_id: string;

  @Column({ type: 'varchar', length: 100 })
  product_id: string;

  @CreateDateColumn()
  created_at: Date;
}
