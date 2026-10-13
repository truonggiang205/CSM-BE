import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryController } from './inventory.controller';
import { Stock } from './entities/stock.entity';
import { Branch } from './entities/branch.entity';
import { StockTransaction, TransactionType } from './entities/stock-transaction.entity';

describe('Inventory Service Idempotency Test (Reserve / Confirm / Release)', () => {
  let controller: InventoryController;

  let stock: Stock;
  let transactions: StockTransaction[];

  beforeEach(async () => {
    stock = {
      id: 'stock-idem-01',
      branch_id: 'br-01',
      product_id: 'prod-001',
      quantity: 20,
      reserved_quantity: 0,
      created_at: new Date(),
      updated_at: new Date(),
      branch: null as any,
    };
    transactions = [];

    const mockDataSource = {
      createQueryRunner: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          findOne: jest.fn().mockImplementation(async (entity, options) => {
            if (entity === Stock) {
              return stock;
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
              stock.quantity = entity.quantity;
              stock.reserved_quantity = entity.reserved_quantity;
              return stock;
            }
            transactions.push(entity);
            return entity;
          }),
          create: jest.fn().mockImplementation((entity, data) => ({
            id: 'tx-' + Math.random(),
            ...data,
          })),
        },
      })),
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

  it('1. reserve-stock idempotent: Goi 2 lan cung referenceId -> lan 2 tra ve idempotent=true va khong giu ton kho lan 2', async () => {
    const payload = {
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 5 }],
      referenceId: 'order-idempotent-reserve-01',
    };

    // Gọi lần 1
    const res1 = await controller.reserveStock(payload);
    expect(res1.success).toBe(true);
    expect(res1.idempotent).toBe(false);
    expect(stock.reserved_quantity).toBe(5);

    // Gọi lần 2 với cùng referenceId
    const res2 = await controller.reserveStock(payload);
    expect(res2.success).toBe(true);
    expect(res2.idempotent).toBe(true);
    // reserved_quantity VẪN LÀ 5, không bị cộng dồn thành 10
    expect(stock.reserved_quantity).toBe(5);
  });

  it('2. confirm-deduct idempotent: Goi 2 lan cung referenceId -> lan 2 tra ve idempotent=true va khong tru kho lan 2', async () => {
    // Chuẩn bị: Đã reserve 5 món trước
    stock.reserved_quantity = 5;
    const refId = 'order-idempotent-confirm-01';

    const payload = {
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 5 }],
      referenceId: refId,
    };

    // Gọi lần 1
    const res1 = await controller.confirmDeductStock(payload);
    expect(res1.success).toBe(true);
    expect(res1.idempotent).toBe(false);
    expect(stock.quantity).toBe(15); // 20 - 5 = 15
    expect(stock.reserved_quantity).toBe(0); // 5 - 5 = 0

    // Gọi lần 2 với cùng referenceId
    const res2 = await controller.confirmDeductStock(payload);
    expect(res2.success).toBe(true);
    expect(res2.idempotent).toBe(true);
    // quantity VẪN LÀ 15, không bị trừ thêm lần nữa
    expect(stock.quantity).toBe(15);
  });

  it('3. release-stock idempotent: Goi 2 lan cung referenceId -> lan 2 tra ve idempotent=true va khong release 2 lan', async () => {
    // Chuẩn bị: Đang giữ 5 món
    stock.reserved_quantity = 5;
    const refId = 'order-idempotent-release-01';

    const payload = {
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 5 }],
      referenceId: refId,
    };

    // Gọi lần 1
    const res1 = await controller.releaseStock(payload);
    expect(res1.success).toBe(true);
    expect(res1.idempotent).toBe(false);
    expect(stock.reserved_quantity).toBe(0);

    // Gọi lần 2 với cùng referenceId
    const res2 = await controller.releaseStock(payload);
    expect(res2.success).toBe(true);
    expect(res2.idempotent).toBe(true);
    expect(stock.reserved_quantity).toBe(0);
  });
});
