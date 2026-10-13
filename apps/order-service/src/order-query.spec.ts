import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrderController } from './order.controller';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('Order Service Query Tests (CSM-29: GET /orders/my, GET /orders, GET /orders/:id)', () => {
  let orderController: OrderController;
  let orderRepository: any;

  const sampleOrders: Partial<Order>[] = [
    {
      id: 'order-001',
      user_id: 'usr-customer-01',
      branch_id: 'br-01',
      total_amount: 150000,
      status: OrderStatus.PENDING,
      created_at: new Date('2026-10-10T10:00:00Z'),
      items: [],
    },
    {
      id: 'order-002',
      user_id: 'usr-customer-01',
      branch_id: 'br-02',
      total_amount: 200000,
      status: OrderStatus.CONFIRMED,
      created_at: new Date('2026-10-11T10:00:00Z'),
      items: [],
    },
    {
      id: 'order-003',
      user_id: 'usr-customer-02',
      branch_id: 'br-01',
      total_amount: 300000,
      status: OrderStatus.PAID,
      created_at: new Date('2026-10-12T10:00:00Z'),
      items: [],
    },
  ];

  let qbState: any;

  beforeEach(async () => {
    qbState = {
      whereClauses: [],
      params: {},
      skipVal: 0,
      takeVal: 10,
    };

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockImplementation((clause: string, params: any) => {
        qbState.whereClauses.push(clause);
        Object.assign(qbState.params, params);
        return mockQueryBuilder;
      }),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockImplementation((val: number) => {
        qbState.skipVal = val;
        return mockQueryBuilder;
      }),
      take: jest.fn().mockImplementation((val: number) => {
        qbState.takeVal = val;
        return mockQueryBuilder;
      }),
      getManyAndCount: jest.fn().mockImplementation(() => {
        let filtered = [...sampleOrders];
        if (qbState.params.userBranch) {
          filtered = filtered.filter((o) => o.branch_id === qbState.params.userBranch);
        }
        if (qbState.params.filterBranch) {
          filtered = filtered.filter((o) => o.branch_id === qbState.params.filterBranch);
        }
        if (qbState.params.status) {
          filtered = filtered.filter((o) => o.status === qbState.params.status);
        }
        if (qbState.params.search) {
          const s = qbState.params.search.replace(/%/g, '');
          filtered = filtered.filter((o) => o.id?.includes(s));
        }
        return Promise.resolve([filtered.slice(qbState.skipVal, qbState.skipVal + qbState.takeVal), filtered.length]);
      }),
    };

    orderRepository = {
      findAndCount: jest.fn().mockImplementation((options) => {
        let filtered = [...sampleOrders];
        if (options?.where?.user_id) {
          filtered = filtered.filter((o) => o.user_id === options.where.user_id);
        }
        if (options?.where?.status) {
          filtered = filtered.filter((o) => o.status === options.where.status);
        }
        const skip = options?.skip || 0;
        const take = options?.take || 10;
        return Promise.resolve([filtered.slice(skip, skip + take), filtered.length]);
      }),
      findOne: jest.fn().mockImplementation((options) => {
        const found = sampleOrders.find((o) => o.id === options.where.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: getRepositoryToken(Order),
          useValue: orderRepository,
        },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    orderController = module.get<OrderController>(OrderController);
    jest.clearAllMocks();
  });

  describe('1. GET /orders/my (Khách hàng xem đơn của chính mình)', () => {
    it('Trả về đúng danh sách đơn của chính người dùng và cấu trúc { items, total, page, limit }', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      const res = await orderController.getMyOrders(mockReq, { page: 1, limit: 10 });

      expect(res).toHaveProperty('items');
      expect(res).toHaveProperty('total', 2);
      expect(res).toHaveProperty('page', 1);
      expect(res).toHaveProperty('limit', 10);
      expect(res.items.every((o: any) => o.user_id === 'usr-customer-01')).toBe(true);
    });

    it('Lọc theo trạng thái status trong đơn của chính mình', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      const res = await orderController.getMyOrders(mockReq, { status: OrderStatus.CONFIRMED });

      expect(res.total).toBe(1);
      expect(res.items[0].status).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('2. GET /orders (Quản trị viên / Cửa hàng trưởng truy vấn đơn)', () => {
    it('CUSTOMER gọi GET /orders -> BỊ TỪ CHỐI 403 Forbidden', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      await expect(orderController.getAllOrders(mockReq, {})).rejects.toThrow(
        new HttpException('Khách hàng không có quyền truy cập danh sách đơn hàng quản trị', HttpStatus.FORBIDDEN),
      );
    });

    it('BRANCH_MANAGER gọi GET /orders -> Luôn bị ép theo chi nhánh của mình, bỏ qua branchId client gửi', async () => {
      const mockReq = {
        user: { id: 'mgr-01', role: 'BRANCH_MANAGER', branch_id: 'br-01' },
        headers: {},
      };
      // Client cố tình truyền branchId='br-02'
      const res = await orderController.getAllOrders(mockReq, { branchId: 'br-02' });

      expect(qbState.params.userBranch).toBe('br-01');
      expect(qbState.params.filterBranch).toBeUndefined();
      expect(res.items.every((o: any) => o.branch_id === 'br-01')).toBe(true);
    });

    it('ADMIN gọi GET /orders -> Xem được tất cả hoặc lọc theo branchId mong muốn', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const resAll = await orderController.getAllOrders(mockReq, {});
      expect(resAll.total).toBe(3);

      const resFilter = await orderController.getAllOrders(mockReq, { branchId: 'br-02' });
      expect(qbState.params.filterBranch).toBe('br-02');
      expect(resFilter.total).toBe(1);
      expect(resFilter.items[0].id).toBe('order-002');
    });

    it('Hỗ trợ tìm kiếm search theo mã đơn hàng', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const res = await orderController.getAllOrders(mockReq, { search: '003' });
      expect(res.total).toBe(1);
      expect(res.items[0].id).toBe('order-003');
    });
  });

  describe('3. GET /orders/:id (Chi tiết đơn hàng & phân quyền truy cập)', () => {
    it('CUSTOMER xem đơn của người khác -> BỊ TỪ CHỐI 403 Forbidden', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      // order-003 thuộc về usr-customer-02
      await expect(orderController.getOrderById('order-003', mockReq)).rejects.toThrow(
        new HttpException('Bạn không có quyền xem đơn hàng của người khác', HttpStatus.FORBIDDEN),
      );
    });

    it('CUSTOMER xem đơn của chính mình -> Thành công', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      const found = await orderController.getOrderById('order-001', mockReq);
      expect(found.id).toBe('order-001');
      expect(found.user_id).toBe('usr-customer-01');
    });

    it('BRANCH_MANAGER xem đơn chi nhánh khác -> BỊ TỪ CHỐI 403 Forbidden', async () => {
      const mockReq = {
        user: { id: 'mgr-01', role: 'BRANCH_MANAGER', branch_id: 'br-01' },
        headers: {},
      };
      // order-002 thuộc về br-02
      await expect(orderController.getOrderById('order-002', mockReq)).rejects.toThrow(
        new HttpException('Nhân viên chỉ được xem đơn hàng thuộc chi nhánh của mình', HttpStatus.FORBIDDEN),
      );
    });

    it('ADMIN xem đơn của bất kỳ chi nhánh/khách hàng nào -> Thành công', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const found = await orderController.getOrderById('order-002', mockReq);
      expect(found.id).toBe('order-002');
    });

    it('Cuộc gọi nội bộ với x-internal-secret -> Thành công', async () => {
      process.env.INTERNAL_SECRET = 'test-internal-secret';
      const mockReq = {
        user: { role: 'SYSTEM' },
        headers: { 'x-internal-secret': 'test-internal-secret' },
      };
      const found = await orderController.getOrderById('order-002', mockReq);
      expect(found.id).toBe('order-002');
    });
  });
});
