import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountColumnsToOrders1710000000007 implements MigrationInterface {
  name = 'AddDiscountColumnsToOrders1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\`
        ADD COLUMN \`subtotal_amount\` decimal(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN \`discount_amount\` decimal(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN \`voucher_code\` varchar(50) NULL DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\`
        DROP COLUMN \`voucher_code\`,
        DROP COLUMN \`discount_amount\`,
        DROP COLUMN \`subtotal_amount\`;
    `);
  }
}
