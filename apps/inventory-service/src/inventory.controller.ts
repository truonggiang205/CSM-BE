import { Controller, Get, Post, Param, Body, BadRequestException, UseGuards, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Stock } from './entities/stock.entity';
import { Branch } from './entities/branch.entity';
import { StockTransaction, TransactionType } from './entities/stock-transaction.entity';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('inventory')
@UseGuards(RolesGuard)
export class InventoryController {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(StockTransaction)
    private readonly stockTxRepository: Repository<StockTransaction>,
    private readonly dataSource: DataSource,
  ) {}

  @Get('transactions')
  async getTransactions(
    @Query('referenceId') referenceId?: string,
    @Query('stockId') stockId?: string,
  ) {
    const where: any = {};
    if (referenceId) where.reference_id = referenceId;
    if (stockId) where.stock_id = stockId;
    return this.stockTxRepository.find({
      where,
      order: { created_at: 'ASC' },
    });
  }

  @Get('branch/:branchId')
  async getInventoryByBranch(@Param('branchId') branchId: string) {
    return this.stockRepository.find({
      where: { branch_id: branchId },
    });
  }

  @Get('product/:productId')
  async getStockByProduct(@Param('productId') productId: string) {
    const branches = await this.branchRepository.find({ order: { name: 'ASC' } });
    const stocks = await this.stockRepository.find({
      where: { product_id: productId },
    });
    const stockMap = new Map(stocks.map((s) => [s.branch_id, s]));

    return branches.map((b) => {
      const s = stockMap.get(b.id);
      const quantity = s ? s.quantity : 0;
      const reserved_quantity = s ? s.reserved_quantity : 0;
      const available = Math.max(0, quantity - reserved_quantity);

      return {
        branch_id: b.id,
        branch_name: b.name,
        branch_address: b.address || '',
        quantity,
        reserved_quantity,
        available,
      };
    });
  }

  // Dành cho Admin hoặc Branch Manager: Nhập thêm tồn kho
  @Roles('ADMIN', 'BRANCH_MANAGER')
  @Post('add-stock')
  async addStock(
    @Body() body: { branchId: string; productId: string; quantity: number; referenceId?: string },
  ) {
    const { branchId, productId, quantity, referenceId } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let stock = await queryRunner.manager.findOne(Stock, {
        where: { branch_id: branchId, product_id: productId },
        lock: { mode: 'pessimistic_write' },
      });

      if (stock) {
        stock.quantity += quantity;
      } else {
        stock = queryRunner.manager.create(Stock, {
          branch_id: branchId,
          product_id: productId,
          quantity,
          reserved_quantity: 0,
        });
      }

      const savedStock = await queryRunner.manager.save(stock);

      // Ghi log giao dịch nhập kho IN trong cùng Transaction
      const tx = queryRunner.manager.create(StockTransaction, {
        stock_id: savedStock.id,
        type: TransactionType.IN,
        quantity,
        reference_id: referenceId || undefined,
      });
      await queryRunner.manager.save(tx);

      await queryRunner.commitTransaction();
      return savedStock;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 1. SAGA - Bước 1: Giữ hàng tạm thời (Reserve Stock) - Idempotent theo referenceId + stock_id
  @Post('reserve-stock')
  async reserveStock(
    @Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }>; referenceId?: string },
  ) {
    const { branchId, items, referenceId } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let alreadyHandledCount = 0;

      for (const item of items) {
        // Sử dụng pessimistic_write để lock dòng record, chống race condition
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock) {
          throw new BadRequestException(`Sản phẩm ID ${item.productId} không có trong kho tại chi nhánh ${branchId}!`);
        }

        // KIỂM TRA IDEMPOTENCY SAU KHI ĐÃ LOCK PESSIMISTIC_WRITE
        if (referenceId) {
          const existingTx = await queryRunner.manager.findOne(StockTransaction, {
            where: {
              reference_id: referenceId,
              stock_id: stock.id,
              type: TransactionType.RESERVE,
            },
          });
          if (existingTx) {
            alreadyHandledCount++;
            continue;
          }
        }

        const available = stock.quantity - stock.reserved_quantity;
        if (available < item.quantity) {
          throw new BadRequestException(
            `Sản phẩm ID ${item.productId} không đủ số lượng có sẵn (Có sẵn: ${available}, Yêu cầu: ${item.quantity})`,
          );
        }

        // Tăng số lượng đang được giữ (giữ chỗ)
        stock.reserved_quantity += item.quantity;
        const savedStock = await queryRunner.manager.save(stock);

        // Ghi bản ghi StockTransaction RESERVE trong CÙNG DB transaction
        const tx = queryRunner.manager.create(StockTransaction, {
          stock_id: savedStock.id,
          type: TransactionType.RESERVE,
          quantity: item.quantity,
          reference_id: referenceId || undefined,
        });
        await queryRunner.manager.save(tx);
      }

      await queryRunner.commitTransaction();

      if (alreadyHandledCount === items.length && items.length > 0) {
        return {
          success: true,
          message: 'Đơn hàng đã được giữ tồn kho trước đó (Idempotent)',
          idempotent: true,
        };
      }

      return { success: true, message: 'Đã giữ hàng (reserve) thành công', idempotent: false };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      // Bắt lỗi trùng khóa unique index (ER_DUP_ENTRY / 1062) khi xảy ra race condition đồng thời
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.message?.includes('Duplicate entry')) {
        return {
          success: true,
          message: 'Đơn hàng đã được giữ tồn kho trước đó (Idempotent race detected)',
          idempotent: true,
        };
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 2. SAGA - Bước 2: Xác nhận thanh toán thành công, trừ kho chính thức (Confirm Deduct) - Idempotent
  @Post('confirm-deduct')
  async confirmDeductStock(
    @Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }>; referenceId?: string },
  ) {
    const { branchId, items, referenceId } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let alreadyHandledCount = 0;

      for (const item of items) {
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock) {
          throw new BadRequestException(`Sản phẩm ID ${item.productId} không có trong kho`);
        }

        // KIỂM TRA IDEMPOTENCY SAU KHI ĐÃ LOCK PESSIMISTIC_WRITE
        if (referenceId) {
          const existingTx = await queryRunner.manager.findOne(StockTransaction, {
            where: {
              reference_id: referenceId,
              stock_id: stock.id,
              type: TransactionType.OUT,
            },
          });
          if (existingTx) {
            alreadyHandledCount++;
            continue;
          }
        }

        if (stock.reserved_quantity < item.quantity) {
          throw new BadRequestException(`Số lượng đang giữ (reserved) không đủ để trừ cho sản phẩm ID ${item.productId}`);
        }

        // Giảm cả tồn kho thực tế và tồn kho đang giữ
        stock.quantity -= item.quantity;
        stock.reserved_quantity -= item.quantity;
        const savedStock = await queryRunner.manager.save(stock);

        // Ghi bản ghi StockTransaction OUT trong CÙNG DB transaction
        const tx = queryRunner.manager.create(StockTransaction, {
          stock_id: savedStock.id,
          type: TransactionType.OUT,
          quantity: item.quantity,
          reference_id: referenceId || undefined,
        });
        await queryRunner.manager.save(tx);
      }

      await queryRunner.commitTransaction();

      if (alreadyHandledCount === items.length && items.length > 0) {
        return {
          success: true,
          message: 'Đơn hàng đã được xác nhận trừ kho trước đó (Idempotent)',
          idempotent: true,
        };
      }

      return { success: true, message: 'Đã trừ tồn kho chính thức thành công', idempotent: false };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.message?.includes('Duplicate entry')) {
        return {
          success: true,
          message: 'Đơn hàng đã được xác nhận trừ kho trước đó (Idempotent race detected)',
          idempotent: true,
        };
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 3. SAGA - Rollback: Hủy giữ hàng (Release Stock) - Idempotent
  @Post('release-stock')
  async releaseStock(
    @Body() body: { branchId: string; items: Array<{ productId: string; quantity: number }>; referenceId?: string },
  ) {
    const { branchId, items, referenceId } = body;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let alreadyHandledCount = 0;

      for (const item of items) {
        const stock = await queryRunner.manager.findOne(Stock, {
          where: { branch_id: branchId, product_id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        // KIỂM TRA IDEMPOTENCY SAU KHI ĐÃ LOCK PESSIMISTIC_WRITE
        if (referenceId && stock) {
          const existingTx = await queryRunner.manager.findOne(StockTransaction, {
            where: {
              reference_id: referenceId,
              stock_id: stock.id,
              type: TransactionType.CANCEL_RESERVE,
            },
          });
          if (existingTx) {
            alreadyHandledCount++;
            continue;
          }
        }

        if (stock && stock.reserved_quantity >= item.quantity) {
          stock.reserved_quantity -= item.quantity;
          const savedStock = await queryRunner.manager.save(stock);

          // Ghi bản ghi CANCEL_RESERVE trong CÙNG DB transaction
          const tx = queryRunner.manager.create(StockTransaction, {
            stock_id: savedStock.id,
            type: TransactionType.CANCEL_RESERVE,
            quantity: item.quantity,
            reference_id: referenceId || undefined,
          });
          await queryRunner.manager.save(tx);
        }
      }

      await queryRunner.commitTransaction();

      if (alreadyHandledCount === items.length && items.length > 0) {
        return {
          success: true,
          message: 'Đơn hàng đã được hoàn kho trước đó (Idempotent)',
          idempotent: true,
        };
      }

      return { success: true, message: 'Đã giải phóng (release) hàng giữ tạm thành công', idempotent: false };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.message?.includes('Duplicate entry')) {
        return {
          success: true,
          message: 'Đơn hàng đã được hoàn kho trước đó (Idempotent race detected)',
          idempotent: true,
        };
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
