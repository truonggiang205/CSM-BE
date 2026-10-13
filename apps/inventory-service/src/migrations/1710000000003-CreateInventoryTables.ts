import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryTables1710000000003 implements MigrationInterface {
  name = 'CreateInventoryTables1710000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`branches\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`address\` varchar(255) DEFAULT NULL,
        \`phone\` varchar(255) DEFAULT NULL,
        \`latitude\` decimal(10,7) DEFAULT NULL,
        \`longitude\` decimal(10,7) DEFAULT NULL,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`stocks\` (
        \`id\` varchar(36) NOT NULL,
        \`product_id\` varchar(255) NOT NULL,
        \`branch_id\` varchar(36) NOT NULL,
        \`quantity\` int NOT NULL DEFAULT 0,
        \`reserved_quantity\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_stocks_product_branch\` (\`product_id\`, \`branch_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_stock_branch\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`stock_transactions\` (
        \`id\` varchar(36) NOT NULL,
        \`stock_id\` varchar(255) NOT NULL,
        \`type\` enum('IN','OUT','RESERVE','CANCEL_RESERVE') NOT NULL,
        \`quantity\` int NOT NULL,
        \`reference_id\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_stock_tx_ref_stock_type\` (\`reference_id\`, \`stock_id\`, \`type\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`stock_transactions\`;`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`stocks\`;`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`branches\`;`);
  }
}
