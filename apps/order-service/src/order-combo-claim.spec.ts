import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** FE#25: order-service phải giữ suất combo (đồng bộ, có khoá) trước khi giữ kho, và trả suất khi đơn lỗi. */
describe('Đặt combo: giữ suất trước, hoàn suất khi đơn lỗi (FE#25)', () => {
  let controller: OrderController;
  let orderRepository: any;
  const calls: string[] = [];

  const comboData = {
    id: 'combo-1',
    name: 'Combo Sáng',
    is_active: true,
    combo_price: 30000,
    max_quantity: 5,
    sold_count: 4,
    items: [
      { product_id: 'p1', product_name: 'Bánh mì', quantity: 1 },
      { product_id: 'p2', product_name: 'Cà phê', quantity: 1 },
    ],
  };

  beforeEach(async () => {
    process.env.INTERNAL_SECRET = 'unit-test-internal-secret-min-32-chars!!';
    calls.length = 0;
    orderRepository = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn(async (o) => ({ ...o, id: o.id || 'ord-1' })),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: { create: jest.fn((d) => d), save: jest.fn(async (d) => d) },
        },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OrderController);
    jest.clearAllMocks();

    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/branches/')) return { data: { id: 'br-01' } } as any;
      if (url.includes('/combos/')) return { data: comboData } as any;
      return { data: {} } as any;
    });
  });

  const req = { user: { id: 'usr-1', role: 'CUSTOMER' }, headers: {} };
  const dto: any = { branchId: 'br-01', combos: [{ comboId: 'combo-1', quantity: 1 }], paymentMethod: 'COD' };

  it('Suất combo vừa bị khách khác lấy mất (409) -> đơn bị từ chối, KHÔNG giữ kho', async () => {
    mockedAxios.post.mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.includes('/combos/claim')) {
        return Promise.reject({ response: { status: 409, data: { message: 'Combo "Combo Sáng" vừa hết suất ưu đãi' } } });
      }
      return { data: { success: true } } as any;
    });

    await expect(controller.createOrder(req, dto)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(calls.some((u) => u.includes('/inventory/reserve-stock'))).toBe(false);
  });

  it('Giữ suất xong nhưng hết hàng trong kho -> trả suất combo (rollback-purchase)', async () => {
    let rollbackBody: any = null;
    mockedAxios.post.mockImplementation(async (url: string, body: any) => {
      calls.push(url);
      if (url.includes('/inventory/reserve-stock')) {
        return Promise.reject({ response: { data: { message: 'Không đủ hàng' } } });
      }
      if (url.includes('/combos/rollback-purchase')) rollbackBody = body;
      return { data: { success: true } } as any;
    });

    await expect(controller.createOrder(req, dto)).rejects.toBeDefined();
    const claimIdx = calls.findIndex((u) => u.includes('/combos/claim'));
    const reserveIdx = calls.findIndex((u) => u.includes('/inventory/reserve-stock'));
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeLessThan(reserveIdx);
    expect(rollbackBody).toEqual({ combos: [{ comboId: 'combo-1', quantity: 1 }] });
  });

  it('Đặt thành công -> không gọi record-purchase nữa (suất đã tính lúc giữ)', async () => {
    mockedAxios.post.mockImplementation(async (url: string) => {
      calls.push(url);
      return { data: { success: true } } as any;
    });
    await controller.createOrder(req, dto);
    expect(calls.filter((u) => u.includes('/combos/claim'))).toHaveLength(1);
    expect(calls.some((u) => u.includes('/combos/record-purchase'))).toBe(false);
    expect(calls.some((u) => u.includes('/combos/rollback-purchase'))).toBe(false);
  });
});
