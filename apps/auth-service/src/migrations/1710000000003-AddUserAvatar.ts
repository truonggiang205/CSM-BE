import { MigrationInterface, QueryRunner } from 'typeorm';

/** Bổ sung ảnh đại diện cho người dùng (an toàn khi chạy lại). */
export class AddUserAvatar1710000000003 implements MigrationInterface {
  name = 'AddUserAvatar1710000000003';

  private async hasColumn(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'`,
    );
    return Number(rows?.[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner))) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD \`avatar_url\` varchar(255) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner)) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`avatar_url\``);
    }
  }
}
