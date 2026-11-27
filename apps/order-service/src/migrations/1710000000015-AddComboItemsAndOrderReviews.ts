import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - order_items: phân biệt món lẻ / combo và lưu ảnh chụp thành phần combo lúc đặt
 * - order_reviews: đánh giá đơn hàng (mỗi đơn 1 đánh giá)
 * Kiểm tra trước khi tạo để chạy an toàn trên DB đã synchronize.
 */
export class AddComboItemsAndOrderReviews1710000000015 implements MigrationInterface {
  name = 'AddComboItemsAndOrderReviews1710000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('order_items', 'item_type'))) {
      await queryRunner.query(
        "ALTER TABLE `order_items` ADD COLUMN `item_type` varchar(20) NOT NULL DEFAULT 'PRODUCT'",
      );
    }
    if (!(await queryRunner.hasColumn('order_items', 'combo_id'))) {
      await queryRunner.query('ALTER TABLE `order_items` ADD COLUMN `combo_id` varchar(100) NULL');
    }
    if (!(await queryRunner.hasColumn('order_items', 'combo_items_snapshot'))) {
      await queryRunner.query('ALTER TABLE `order_items` ADD COLUMN `combo_items_snapshot` text NULL');
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`order_reviews\` (
        \`id\` varchar(36) NOT NULL,
        \`order_id\` varchar(100) NOT NULL,
        \`user_id\` varchar(100) NOT NULL,
        \`customer_name\` varchar(150) NOT NULL,
        \`rating\` int NOT NULL DEFAULT 5,
        \`comment\` text NOT NULL,
        \`purchased_item\` varchar(255) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_order_reviews_order\` (\`order_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `order_reviews`');
    for (const col of ['combo_items_snapshot', 'combo_id', 'item_type']) {
      if (await queryRunner.hasColumn('order_items', col)) {
        await queryRunner.query(`ALTER TABLE \`order_items\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
