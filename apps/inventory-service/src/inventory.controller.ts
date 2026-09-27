import { Controller, Get, Post, Param, Body, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Stock } from './entities/stock.entity';

@Controller('inventory')
export class InventoryController {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    private readonly dataSource: DataSource,
  ) {}

  @Get('branch/:branchId')
  async getInventoryByBranch(@Param('branchId') branchId: string) {
    return this.stockRepository.find({
      where: { branch_id: branchId },
      // relations: ['branch'], // Uncomment if needed
    });
  }

  // Dành cho Admin: Nhập thêm tồn kho
  @Post('add-stock')
  async addStock(@Body() body: { branchId: string; productId: string; quantity: number }) {
    const { branchId, productId, quantity } = body;
    let stock = await this.stockRepository.findOne({
      where: { branch_id: branchId, product_id: productId },
    });

    if (stock) {
      stock.quantity += quantity;
    } else {
      stock = this.stockRepository.create({
        branch_id: branchId,
        product_id: productId,
        quantity,
        reserved_quantity: 0,
      });
    }

    return this.stockRepository.save(stock);
  }

  // 1. SAGA - Bước 1: Giữ hàng tạm thời (Reserve Stock)
  @Post('reserve-stock')
  async reserveStock(@Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }> }) {
    const { branchId, items } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // Sử dụng pessimistic_write để lock dòng record, tránh race condition (bán vượt kho)
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock) {
          throw new BadRequestException(`Sản phẩm ID ${item.productId} không có trong kho tại chi nhánh ${branchId}!`);
        }

        const available = stock.quantity - stock.reserved_quantity;
        if (available < item.quantity) {
          throw new BadRequestException(`Sản phẩm ID ${item.productId} không đủ số lượng có sẵn (Có sẵn: ${available}, Yêu cầu: ${item.quantity})`);
        }

        // Tăng số lượng đang được giữ (giữ chỗ)
        stock.reserved_quantity += item.quantity;
        await queryRunner.manager.save(stock);
      }

      await queryRunner.commitTransaction();
      return { success: true, message: 'Đã giữ hàng (reserve) thành công' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 2. SAGA - Bước 2: Xác nhận thanh toán thành công, trừ kho chính thức (Confirm Deduct)
  @Post('confirm-deduct')
  async confirmDeductStock(@Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }> }) {
    const { branchId, items } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock) {
          throw new BadRequestException(`Sản phẩm ID ${item.productId} không có trong kho`);
        }

        if (stock.reserved_quantity < item.quantity) {
          throw new BadRequestException(`Số lượng đang giữ (reserved) không đủ để trừ cho sản phẩm ID ${item.productId}`);
        }

        // Giảm cả tồn kho thực tế và tồn kho đang giữ
        stock.quantity -= item.quantity;
        stock.reserved_quantity -= item.quantity;
        await queryRunner.manager.save(stock);
      }

      await queryRunner.commitTransaction();
      return { success: true, message: 'Đã trừ tồn kho chính thức thành công' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 3. SAGA - Rollback: Hủy giữ hàng (Release Stock) khi giao dịch thất bại
  @Post('release-stock')
  async releaseStock(@Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }> }) {
    const { branchId, items } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (stock && stock.reserved_quantity >= item.quantity) {
          // Hoàn lại số lượng đã giữ, trả lại kho (available kho tự động tăng do reserved giảm)
          stock.reserved_quantity -= item.quantity;
          await queryRunner.manager.save(stock);
        }
      }

      await queryRunner.commitTransaction();
      return { success: true, message: 'Đã giải phóng (release) hàng giữ tạm thành công' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
