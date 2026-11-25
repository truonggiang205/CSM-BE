import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDiscountTables1710000000008 implements MigrationInterface {
  name = 'CreateDiscountTables1710000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`vouchers\` (
        \`id\` varchar(36) NOT NULL,
        \`code\` varchar(50) NOT NULL,
        \`description\` varchar(255) NULL,
        \`discount_type\` enum('FIXED_AMOUNT','PERCENTAGE') NOT NULL DEFAULT 'FIXED_AMOUNT',
        \`discount_value\` decimal(10,2) NOT NULL,
        \`min_order_value\` decimal(10,2) NOT NULL DEFAULT 0.00,
        \`max_discount_amount\` decimal(10,2) NULL,
        \`usage_limit\` int NOT NULL DEFAULT 100,
        \`max_usage_per_user\` int NOT NULL DEFAULT 1,
        \`used_count\` int NOT NULL DEFAULT 0,
        \`start_date\` datetime NOT NULL,
        \`end_date\` datetime NOT NULL,
        \`is_freeship\` tinyint NOT NULL DEFAULT 0,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_vouchers_code\` (\`code\`),
        INDEX \`IDX_vouchers_active_dates\` (\`is_active\`, \`start_date\`, \`end_date\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`voucher_usages\` (
        \`id\` varchar(36) NOT NULL,
        \`voucher_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`order_id\` varchar(255) NOT NULL,
        \`status\` enum('USED','REFUNDED') NOT NULL DEFAULT 'USED',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_voucher_usages_user\` (\`voucher_id\`, \`user_id\`),
        INDEX \`IDX_voucher_usages_order\` (\`order_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_voucher_usages_voucher\` FOREIGN KEY (\`voucher_id\`) REFERENCES \`vouchers\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`voucher_usages\`;`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`vouchers\`;`);
  }
}
