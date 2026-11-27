import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - products: đánh dấu món CSM Picks (is_featured) và lời giới thiệu (curator_note)
 * - wishlist_items: danh sách yêu thích của khách
 * Kiểm tra trước khi tạo để chạy an toàn trên DB đã synchronize.
 */
export class AddCsmPicksAndWishlist1710000000016 implements MigrationInterface {
  name = 'AddCsmPicksAndWishlist1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('products', 'is_featured'))) {
      await queryRunner.query('ALTER TABLE `products` ADD COLUMN `is_featured` tinyint NOT NULL DEFAULT 0');
    }
    if (!(await queryRunner.hasColumn('products', 'curator_note'))) {
      await queryRunner.query('ALTER TABLE `products` ADD COLUMN `curator_note` varchar(500) NULL');
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`wishlist_items\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(100) NOT NULL,
        \`product_id\` varchar(100) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_wishlist_user_product\` (\`user_id\`, \`product_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `wishlist_items`');
    for (const col of ['curator_note', 'is_featured']) {
      if (await queryRunner.hasColumn('products', col)) {
        await queryRunner.query(`ALTER TABLE \`products\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
