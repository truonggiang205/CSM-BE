import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodToOrders1710000000006 implements MigrationInterface {
  name = 'AddPaymentMethodToOrders1710000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\` ADD COLUMN \`payment_method\` varchar(50) NOT NULL DEFAULT 'COD' AFTER \`total_amount\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\` DROP COLUMN \`payment_method\`;
    `);
  }
}
