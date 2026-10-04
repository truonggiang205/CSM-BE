import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductTables1710000000002 implements MigrationInterface {
  name = 'CreateProductTables1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` varchar(36) NOT NULL,
        \`sku\` varchar(255) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` text DEFAULT NULL,
        \`base_price\` decimal(10,2) NOT NULL,
        \`image_url\` varchar(255) DEFAULT NULL,
        \`category_id\` varchar(36) DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_product_sku\` (\`sku\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_product_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`products\`;`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`categories\`;`);
  }
}
