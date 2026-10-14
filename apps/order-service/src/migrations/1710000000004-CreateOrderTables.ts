import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrderTables1710000000004 implements MigrationInterface {
  name = 'CreateOrderTables1710000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`branch_id\` varchar(255) NOT NULL,
        \`total_amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
        \`status\` enum('PENDING','CONFIRMED','PAID','SHIPPED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`order_items\` (
        \`id\` varchar(36) NOT NULL,
        \`order_id\` varchar(36) NOT NULL,
        \`product_id\` varchar(255) NOT NULL,
        \`product_name_snapshot\` varchar(255) NOT NULL,
        \`price_snapshot\` decimal(10,2) NOT NULL,
        \`quantity\` int NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_order_item_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`order_items\`;`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`orders\`;`);
  }
}
