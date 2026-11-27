import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flash Sale (Giờ vàng), Combo tiết kiệm và lịch sử Vòng quay may mắn.
 * Viết kiểu "IF NOT EXISTS" / kiểm tra cột trước để chạy an toàn trên DB đã được
 * TypeORM synchronize tạo bảng sẵn (môi trường development).
 */
export class CreateFlashSaleComboSpinTables1710000000014 implements MigrationInterface {
  name = 'CreateFlashSaleComboSpinTables1710000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`flash_sale_campaigns\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`apply_date\` date NULL,
        \`start_date\` date NULL,
        \`end_date\` date NULL,
        \`start_time\` time NOT NULL,
        \`end_time\` time NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`banner_url\` varchar(500) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    if (!(await queryRunner.hasTable('flash_sale_items'))) {
      await queryRunner.query(`
        CREATE TABLE \`flash_sale_items\` (
          \`id\` varchar(36) NOT NULL,
          \`campaign_id\` varchar(255) NOT NULL,
          \`product_id\` varchar(100) NOT NULL,
          \`product_name\` varchar(255) NOT NULL,
          \`product_image\` varchar(500) NULL,
          \`original_price\` decimal(12,2) NOT NULL,
          \`sale_price\` decimal(12,2) NOT NULL,
          \`discount_percentage\` int NOT NULL DEFAULT 0,
          \`discount_type\` varchar(16) NOT NULL DEFAULT 'PERCENT',
          \`discount_value\` decimal(12,2) NOT NULL DEFAULT 0,
          \`quantity_limit\` int NOT NULL DEFAULT 50,
          \`sold_count\` int NOT NULL DEFAULT 0,
          \`max_per_user\` int NOT NULL DEFAULT 2,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_flash_sale_items_campaign_product\` (\`campaign_id\`, \`product_id\`),
          CONSTRAINT \`FK_flash_sale_items_campaign\` FOREIGN KEY (\`campaign_id\`)
            REFERENCES \`flash_sale_campaigns\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    } else {
      // Bảng đã có từ trước (synchronize): chỉ bổ sung kiểu giảm % / tiền mặt
      if (!(await queryRunner.hasColumn('flash_sale_items', 'discount_type'))) {
        await queryRunner.query(
          "ALTER TABLE `flash_sale_items` ADD COLUMN `discount_type` varchar(16) NOT NULL DEFAULT 'PERCENT' AFTER `discount_percentage`",
        );
      }
      if (!(await queryRunner.hasColumn('flash_sale_items', 'discount_value'))) {
        await queryRunner.query(
          'ALTER TABLE `flash_sale_items` ADD COLUMN `discount_value` decimal(12,2) NOT NULL DEFAULT 0 AFTER `discount_type`',
        );
        // Dữ liệu cũ được hiểu là giảm theo %
        await queryRunner.query('UPDATE `flash_sale_items` SET `discount_value` = `discount_percentage`');
      }
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`combos\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` text NULL,
        \`combo_price\` decimal(12,2) NOT NULL,
        \`original_price\` decimal(12,2) NOT NULL,
        \`image_url\` varchar(500) NULL,
        \`start_date\` datetime NULL,
        \`end_date\` datetime NULL,
        \`max_quantity\` int NULL,
        \`sold_count\` int NOT NULL DEFAULT 0,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`combo_items\` (
        \`id\` varchar(36) NOT NULL,
        \`combo_id\` varchar(255) NOT NULL,
        \`product_id\` varchar(100) NOT NULL,
        \`product_name\` varchar(255) NULL,
        \`product_image\` varchar(500) NULL,
        \`original_price\` decimal(12,2) NOT NULL DEFAULT 0,
        \`quantity\` int NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_combo_items_combo_product\` (\`combo_id\`, \`product_id\`),
        CONSTRAINT \`FK_combo_items_combo\` FOREIGN KEY (\`combo_id\`)
          REFERENCES \`combos\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`spin_history\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(100) NOT NULL,
        \`spin_date\` varchar(10) NOT NULL,
        \`prize_id\` varchar(50) NOT NULL,
        \`prize_label\` varchar(100) NOT NULL,
        \`voucher_code\` varchar(50) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_spin_history_user_date\` (\`user_id\`, \`spin_date\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `spin_history`');
    await queryRunner.query('DROP TABLE IF EXISTS `combo_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `combos`');
    await queryRunner.query('DROP TABLE IF EXISTS `flash_sale_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `flash_sale_campaigns`');
  }
}
