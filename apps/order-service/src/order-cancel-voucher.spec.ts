import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { OrderController } from './order.controller';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * FE#46: khi khách / admin huỷ đơn có dùng voucher, order-service phải gọi
 * discount-service release để hoàn lại lượt dùng mã cho đúng khách và đúng đơn.
 */
describe('Huỷ đơn có voucher -> hoàn voucher (FE#46)', () => {
  let controller: OrderController;
  let orderRepository: any;

  const buildOrder = (status: OrderStatus, overrides: Partial<Order> = {}) =>
    ({
      id: 'ord-voucher-001',
      user_id: 'usr-001',
      branch_id: 'br-01',
      status,
      voucher_code: 'CSM20K',
      items: [{ product_id: 'prod-001', quantity: 1, item_type: 'PRODUCT' }],
      ...overrides,
    }) as any;

  beforeEach(async () => {
    process.env.INTERNAL_SECRET = 'unit-test-internal-secret-min-32-chars!!';
    orderRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(OrderController);
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { success: true }, status: 200 } as any);
  });

  const releaseCalls = () =>
    mockedAxios.post.mock.calls.filter(([url]) => String(url).includes('/vouchers/release'));

  it('Khách huỷ đơn PENDING của mình -> gọi release voucher với đúng mã, user, đơn', async () => {
    orderRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.PENDING));
    const req = { user: { id: 'usr-001', role: 'CUSTOMER' }, headers: {} };

    const res = await controller.updateOrderStatus('ord-voucher-001', { status: OrderStatus.CANCELLED } as any, req);

    expect(res.status).toBe(OrderStatus.CANCELLED);
    const calls = releaseCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ code: 'CSM20K', userId: 'usr-001', orderId: 'ord-voucher-001' });
    expect((calls[0][2] as any).headers['x-internal-secret']).toBe(process.env.INTERNAL_SECRET);
  });

  it('Admin huỷ đơn đã CONFIRMED -> vẫn hoàn voucher', async () => {
    orderRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.CONFIRMED));
    const req = { user: { id: 'admin-1', role: 'ADMIN' }, headers: {} };

    await controller.updateOrderStatus('ord-voucher-001', { status: OrderStatus.CANCELLED } as any, req);

    expect(releaseCalls()).toHaveLength(1);
    expect(releaseCalls()[0][1]).toMatchObject({ code: 'CSM20K', userId: 'usr-001' });
  });

  it('Đơn không dùng voucher -> không gọi release voucher', async () => {
    orderRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.PENDING, { voucher_code: null as any }));
    const req = { user: { id: 'usr-001', role: 'CUSTOMER' }, headers: {} };

    await controller.updateOrderStatus('ord-voucher-001', { status: OrderStatus.CANCELLED } as any, req);

    expect(releaseCalls()).toHaveLength(0);
  });

  it('Discount-service lỗi khi hoàn voucher -> đơn vẫn huỷ được (không chặn khách)', async () => {
    orderRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.PENDING));
    mockedAxios.post.mockImplementation((url: string) =>
      url.includes('/vouchers/release') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve({ data: {} } as any),
    );
    const req = { user: { id: 'usr-001', role: 'CUSTOMER' }, headers: {} };

    const res = await controller.updateOrderStatus('ord-voucher-001', { status: OrderStatus.CANCELLED } as any, req);
    expect(res.status).toBe(OrderStatus.CANCELLED);
  });
});
