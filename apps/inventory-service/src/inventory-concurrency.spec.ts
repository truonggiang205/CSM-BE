import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryController } from './inventory.controller';

import { Stock } from './entities/stock.entity';
import { Branch } from './entities/branch.entity';
import { StockTransaction, TransactionType } from './entities/stock-transaction.entity';

describe('Inventory Service Concurrency Test (Reserve-stock dong thoi khong ban vuot ton)', () => {
  let controller: InventoryController;

  // Giả lập 1 record Stock duy nhất trong DB có quantity = 10, reserved_quantity = 0
  let sharedStock: Stock;
  let transactions: StockTransaction[];

  // Giả lập Mutex / Pessimistic Write Lock của Database
  let dbLockPromise: Promise<void> = Promise.resolve();

  beforeEach(async () => {
    sharedStock = {
      id: 'stock-concurrency-01',
      branch_id: 'br-01',
      product_id: 'prod-001',
      quantity: 10,
      reserved_quantity: 0,
      created_at: new Date(),
      updated_at: new Date(),
      branch: null as any,
    };
    transactions = [];

    const mockDataSource = {
      createQueryRunner: jest.fn().mockImplementation(() => {
        let releaseLock: () => void;

        return {
          connect: jest.fn().mockResolvedValue(undefined),
          startTransaction: jest.fn().mockImplementation(async () => {
            // Giả lập khóa hàng đợi giao dịch pessimistic_write
            let currentLock = dbLockPromise;
            let acquireLock: () => void;
            dbLockPromise = new Promise((resolve) => {
              acquireLock = resolve;
            });
            await currentLock;
            releaseLock = acquireLock!;
          }),
          commitTransaction: jest.fn().mockResolvedValue(undefined),
          rollbackTransaction: jest.fn().mockResolvedValue(undefined),
          release: jest.fn().mockImplementation(() => {
            if (releaseLock) releaseLock();
          }),
          manager: {
            findOne: jest.fn().mockImplementation(async (entity, options) => {
              if (entity === Stock) {
                // Trả về bản sao trạng thái mới nhất của record trong DB
                return { ...sharedStock };
              }
              if (entity === StockTransaction) {
                return transactions.find(
                  (tx) =>
                    tx.reference_id === options.where.reference_id &&
                    tx.stock_id === options.where.stock_id &&
                    tx.type === options.where.type,
                );
              }
              return null;
            }),
            save: jest.fn().mockImplementation(async (entity) => {
              if ('reserved_quantity' in entity) {
                // Cập nhật record tồn kho trong DB
                sharedStock.quantity = entity.quantity;
                sharedStock.reserved_quantity = entity.reserved_quantity;
                return { ...sharedStock };
              }
              transactions.push(entity);
              return entity;
            }),
            create: jest.fn().mockImplementation((entity, data) => ({
              id: 'tx-' + Math.random(),
              ...data,
            })),
          },
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: getRepositoryToken(Stock),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Branch),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(StockTransaction),
          useValue: { find: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  it('5 requests dong thoi moi request dat 3 san pham (tong 15) tren ton kho 10 -> Dung 3 ca thanh cong, 2 ca tu choi, ton kho khong bi am', async () => {
    // Tạo 5 yêu cầu giữ kho đồng thời
    const concurrentRequests = Array.from({ length: 5 }, (_, i) => ({
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 3 }],
      referenceId: `order-concurrent-${i + 1}`,
    }));

    const results = await Promise.allSettled(
      concurrentRequests.map((dto) => controller.reserveStock(dto)),
    );

    const successfulReserves = results.filter((r) => r.status === 'fulfilled');
    const failedReserves = results.filter((r) => r.status === 'rejected');

    // 1. Kiểm tra số lượng thành công và thất bại
    expect(successfulReserves.length).toBe(3); // 3 * 3 = 9 san pham
    expect(failedReserves.length).toBe(2);     // 2 yeu cau vuot qua 10 bi tu choi

    // 2. Kiểm tra lỗi trả về của 2 ca thất bại
    for (const fail of failedReserves) {
      if (fail.status === 'rejected') {
        expect(fail.reason).toBeInstanceOf(BadRequestException);
        expect(fail.reason.message).toContain('không đủ số lượng có sẵn');
      }
    }

    // 3. Tồn kho thực tế và giữ chỗ sau các giao dịch đồng thời
    expect(sharedStock.quantity).toBe(10);
    expect(sharedStock.reserved_quantity).toBe(9); // Không bao giờ vượt quá 10
    expect(sharedStock.quantity - sharedStock.reserved_quantity).toBe(1); // Còn lại 1 khả dụng

    // 4. Kiểm tra đúng 3 bản ghi StockTransaction RESERVE được tạo
    const reserveTxs = transactions.filter((t) => t.type === TransactionType.RESERVE);
    expect(reserveTxs.length).toBe(3);
  });
});
