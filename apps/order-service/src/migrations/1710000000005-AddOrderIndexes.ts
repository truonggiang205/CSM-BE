import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderIndexes1710000000005 implements MigrationInterface {
  name = 'AddOrderIndexes1710000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX \`IDX_orders_user_id\` ON \`orders\` (\`user_id\`);
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_orders_branch_id\` ON \`orders\` (\`branch_id\`);
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_orders_status\` ON \`orders\` (\`status\`);
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_orders_created_at\` ON \`orders\` (\`created_at\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_orders_created_at\` ON \`orders\`;`);
    await queryRunner.query(`DROP INDEX \`IDX_orders_status\` ON \`orders\`;`);
    await queryRunner.query(`DROP INDEX \`IDX_orders_branch_id\` ON \`orders\`;`);
    await queryRunner.query(`DROP INDEX \`IDX_orders_user_id\` ON \`orders\`;`);
  }
}
