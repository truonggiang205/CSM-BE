import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * products.is_active: trạng thái bán của sản phẩm (Đang bán / Tạm ngưng).
 * Sản phẩm tạm ngưng không hiện ở cửa hàng và không đặt hàng được.
 */
export class AddProductIsActive1710000000019 implements MigrationInterface {
  name = 'AddProductIsActive1710000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('products', 'is_active'))) {
      await queryRunner.query('ALTER TABLE `products` ADD COLUMN `is_active` tinyint NOT NULL DEFAULT 1');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('products', 'is_active')) {
      await queryRunner.query('ALTER TABLE `products` DROP COLUMN `is_active`');
    }
  }
}
