import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mở rộng tùy chỉnh giao diện:
 * - banners: thêm vị trí hiển thị (placement) và đếm lượt bấm (click_count)
 * - announcements: thanh thông báo trên cùng
 * - home_layouts: thứ tự và bật/tắt các khối trang chủ
 */
export class StorefrontPlacementsAnnouncementsLayout1710000000013 implements MigrationInterface {
  name = 'StorefrontPlacementsAnnouncementsLayout1710000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('banners', 'placement'))) {
      await queryRunner.query(
        "ALTER TABLE `banners` ADD COLUMN `placement` varchar(30) NOT NULL DEFAULT 'HOME_HERO' AFTER `id`",
      );
    }
    if (!(await queryRunner.hasColumn('banners', 'click_count'))) {
      await queryRunner.query('ALTER TABLE `banners` ADD COLUMN `click_count` int NOT NULL DEFAULT 0 AFTER `branch_id`');
    }
    await queryRunner.query(
      'CREATE INDEX `IDX_banners_placement_scope` ON `banners` (`placement`, `branch_id`, `is_active`, `sort_order`)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`announcements\` (
        \`id\` varchar(36) NOT NULL,
        \`message\` varchar(255) NOT NULL,
        \`link_url\` varchar(500) NULL,
        \`link_text\` varchar(60) NULL,
        \`tone\` varchar(20) NOT NULL DEFAULT 'primary',
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`start_at\` datetime NULL,
        \`end_at\` datetime NULL,
        \`branch_id\` varchar(36) NULL,
        \`created_by\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_announcements_scope\` (\`branch_id\`, \`is_active\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`home_layouts\` (
        \`id\` varchar(36) NOT NULL,
        \`branch_id\` varchar(36) NULL,
        \`blocks\` text NOT NULL,
        \`updated_by\` varchar(36) NULL,
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_home_layouts_branch\` (\`branch_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `home_layouts`');
    await queryRunner.query('DROP TABLE IF EXISTS `announcements`');
    await queryRunner.query('DROP INDEX `IDX_banners_placement_scope` ON `banners`');
    await queryRunner.query('ALTER TABLE `banners` DROP COLUMN `click_count`');
    await queryRunner.query('ALTER TABLE `banners` DROP COLUMN `placement`');
  }
}
