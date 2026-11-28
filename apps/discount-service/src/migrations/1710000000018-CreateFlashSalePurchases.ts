import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhật ký suất Giờ Vàng theo đơn hàng (giới hạn mỗi khách, hoàn suất khi huỷ đơn, chống race condition).
 * Dùng "IF NOT EXISTS" để an toàn trên DB đã được synchronize tạo bảng.
 */
export class CreateFlashSalePurchases1710000000018 implements MigrationInterface {
  name = 'CreateFlashSalePurchases1710000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`flash_sale_purchases\` (
        \`id\` varchar(36) NOT NULL,
        \`order_id\` varchar(64) NOT NULL,
        \`user_id\` varchar(64) NOT NULL,
        \`campaign_id\` varchar(36) NOT NULL,
        \`flash_sale_item_id\` varchar(36) NOT NULL,
        \`product_id\` varchar(100) NOT NULL,
        \`quantity\` int NOT NULL,
        \`sale_price\` decimal(12,2) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'RESERVED',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_flash_sale_purchases_order\` (\`order_id\`),
        INDEX \`IDX_flash_sale_purchases_user_item\` (\`user_id\`, \`flash_sale_item_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `flash_sale_purchases`');
  }
}
