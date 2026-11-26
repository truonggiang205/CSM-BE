import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng phục vụ tùy chỉnh trang chủ: banner và các khối sản phẩm nổi bật.
 * branch_id = NULL là cấu hình toàn chuỗi (ADMIN), có giá trị là của một chi nhánh (BRANCH_MANAGER).
 */
export class CreateStorefrontTables1710000000012 implements MigrationInterface {
  name = 'CreateStorefrontTables1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`banners\` (
        \`id\` varchar(36) NOT NULL,
        \`title\` varchar(150) NOT NULL,
        \`highlight\` varchar(150) NULL,
        \`badge\` varchar(80) NULL,
        \`description\` text NULL,
        \`image_url\` varchar(500) NOT NULL,
        \`link_url\` varchar(500) NULL,
        \`cta_text\` varchar(60) NULL,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`start_at\` datetime NULL,
        \`end_at\` datetime NULL,
        \`branch_id\` varchar(36) NULL,
        \`created_by\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_banners_scope\` (\`branch_id\`, \`is_active\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`home_sections\` (
        \`id\` varchar(36) NOT NULL,
        \`type\` varchar(30) NOT NULL,
        \`title\` varchar(150) NULL,
        \`subtitle\` varchar(255) NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`start_at\` datetime NULL,
        \`end_at\` datetime NULL,
        \`branch_id\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_home_sections_scope\` (\`type\`, \`branch_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`home_section_items\` (
        \`id\` varchar(36) NOT NULL,
        \`section_id\` varchar(36) NOT NULL,
        \`product_id\` varchar(36) NOT NULL,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`note\` varchar(255) NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_home_section_items_section\` FOREIGN KEY (\`section_id\`) REFERENCES \`home_sections\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_home_section_items_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `home_section_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `home_sections`');
    await queryRunner.query('DROP TABLE IF EXISTS `banners`');
  }
}
