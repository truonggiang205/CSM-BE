import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung họ tên và số điện thoại cho người dùng (trang Hồ sơ).
 * Kiểm tra information_schema trước để chạy lại nhiều lần vẫn an toàn
 * (MySQL không hỗ trợ ADD COLUMN IF NOT EXISTS).
 */
export class AddUserProfileFields1710000000002 implements MigrationInterface {
  name = 'AddUserProfileFields1710000000002';

  private async hasColumn(queryRunner: QueryRunner, column: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [column],
    );
    return Number(rows?.[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, 'full_name'))) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD \`full_name\` varchar(100) NULL`);
    }
    if (!(await this.hasColumn(queryRunner, 'phone'))) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD \`phone\` varchar(20) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'phone')) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`phone\``);
    }
    if (await this.hasColumn(queryRunner, 'full_name')) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`full_name\``);
    }
  }
}
