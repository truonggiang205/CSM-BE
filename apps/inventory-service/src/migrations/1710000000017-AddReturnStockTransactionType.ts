import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm loại giao dịch kho RETURN: hoàn hàng về kho khi huỷ đơn đã trừ kho (CONFIRMED / PAID).
 * MODIFY COLUMN chạy lặp lại vẫn an toàn (kể cả trên DB đã synchronize có sẵn giá trị RETURN).
 */
export class AddReturnStockTransactionType1710000000017 implements MigrationInterface {
  name = 'AddReturnStockTransactionType1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `stock_transactions` MODIFY COLUMN `type` enum('IN','OUT','RESERVE','CANCEL_RESERVE','RETURN') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM `stock_transactions` WHERE `type` = 'RETURN'");
    await queryRunner.query(
      "ALTER TABLE `stock_transactions` MODIFY COLUMN `type` enum('IN','OUT','RESERVE','CANCEL_RESERVE') NOT NULL",
    );
  }
}
