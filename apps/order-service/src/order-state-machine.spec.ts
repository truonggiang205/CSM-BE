import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { OrderController } from './order.controller';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Order Service State Machine Test (May trang thai don hang)', () => {
  let orderController: OrderController;
  let orderRepository: any;
  let orderItemRepository: any;

  let currentOrder: Order;

  beforeEach(async () => {
    currentOrder = {
      id: 'order-sm-01',
      user_id: 'usr-customer-01',
      branch_id: 'br-01',
      total_amount: 100000,
      status: OrderStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
      items: [
        {
          id: 'item-01',
          order: null as any,
          product_id: 'prod-01',
          product_name_snapshot: 'Trà Sữa',
          price_snapshot: 50000,
          quantity: 2,
          created_at: new Date(),
        },
      ],
    };

    orderRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...currentOrder })),
      save: jest.fn().mockImplementation((order) => {
        currentOrder = { ...order };
        return Promise.resolve(currentOrder);
      }),
    };

    orderItemRepository = {
      save: jest.fn(),
    };

    // Mock axios post cho inventory confirm-deduct / release-stock
    mockedAxios.post.mockResolvedValue({ data: { success: true } });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: getRepositoryToken(Order),
          useValue: orderRepository,
        },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: orderItemRepository,
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

  describe('1. Chuyển trạng thái hợp lệ (Valid Transitions)', () => {
    it('PENDING -> CONFIRMED bởi ADMIN -> Thành công và kích hoạt confirm-deduct', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const updated = await orderController.updateOrderStatus(
        'order-sm-01',
        { status: OrderStatus.CONFIRMED },
        mockReq,
      );

      expect(updated.status).toBe(OrderStatus.CONFIRMED);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/inventory/confirm-deduct'),
        expect.anything(),
      );
    });

    it('PENDING -> CANCELLED bởi chính CUSTOMER -> Thành công và kích hoạt release-stock', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      const updated = await orderController.updateOrderStatus(
        'order-sm-01',
        { status: OrderStatus.CANCELLED },
        mockReq,
      );

      expect(updated.status).toBe(OrderStatus.CANCELLED);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/inventory/release-stock'),
        expect.anything(),
      );
    });

    it('CONFIRMED -> PAID bởi ADMIN -> Thành công', async () => {
      currentOrder.status = OrderStatus.CONFIRMED;
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const updated = await orderController.updateOrderStatus(
        'order-sm-01',
        { status: OrderStatus.PAID },
        mockReq,
      );

      expect(updated.status).toBe(OrderStatus.PAID);
    });

    it('PAID -> SHIPPED bởi ADMIN -> Thành công', async () => {
      currentOrder.status = OrderStatus.PAID;
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      const updated = await orderController.updateOrderStatus(
        'order-sm-01',
        { status: OrderStatus.SHIPPED },
        mockReq,
      );

      expect(updated.status).toBe(OrderStatus.SHIPPED);
    });
  });

  describe('2. Chuyển trạng thái bất hợp lệ bị từ chối 400 (Invalid Transitions)', () => {
    it('PENDING -> PAID trực tiếp (bỏ qua CONFIRMED) -> Ném 400 Bad Request', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.PAID }, mockReq),
      ).rejects.toThrow(HttpException);

      try {
        await orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.PAID }, mockReq);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(err.message).toContain('Không thể chuyển từ PENDING sang PAID');
      }
    });


    it('PENDING -> SHIPPED trực tiếp -> Ném 400 Bad Request', async () => {
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.SHIPPED }, mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('CANCELLED -> bất kỳ trạng thái nào -> Ném 400 Bad Request', async () => {
      currentOrder.status = OrderStatus.CANCELLED;
      const mockReq = { user: { id: 'admin-01', role: 'ADMIN' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.PENDING }, mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('3. Ràng buộc phân quyền theo vai trò (Role-based state constraints)', () => {
    it('CUSTOMER cố tình tự duyệt đơn PENDING -> CONFIRMED -> Bị từ chối 403 Forbidden', async () => {
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.CONFIRMED }, mockReq),
      ).rejects.toThrow(
        new HttpException('Khách hàng không có quyền chuyển sang trạng thái này', HttpStatus.FORBIDDEN),
      );
    });

    it('CUSTOMER cố tình huỷ đơn của khách hàng khác -> Bị từ chối 403 Forbidden', async () => {
      const mockReq = { user: { id: 'usr-other-customer', role: 'CUSTOMER' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.CANCELLED }, mockReq),
      ).rejects.toThrow(
        new HttpException('Bạn không có quyền can thiệp vào đơn hàng của người khác', HttpStatus.FORBIDDEN),
      );
    });

    it('CUSTOMER cố huỷ đơn khi đã CONFIRMED -> Bị từ chối 403 Forbidden', async () => {
      currentOrder.status = OrderStatus.CONFIRMED;
      const mockReq = { user: { id: 'usr-customer-01', role: 'CUSTOMER' }, headers: {} };
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.CANCELLED }, mockReq),
      ).rejects.toThrow(
        new HttpException('Khách hàng chỉ có quyền huỷ đơn hàng khi đơn còn ở trạng thái PENDING', HttpStatus.FORBIDDEN),
      );
    });

    it('BRANCH_MANAGER cập nhật đơn khác chi nhánh phụ trách -> Bị từ chối 403 Forbidden', async () => {
      const mockReq = { user: { id: 'mgr-02', role: 'BRANCH_MANAGER', branch_id: 'br-02' }, headers: {} };
      // Đơn hàng thuộc br-01, manager phụ trách br-02
      await expect(
        orderController.updateOrderStatus('order-sm-01', { status: OrderStatus.CONFIRMED }, mockReq),
      ).rejects.toThrow(
        new HttpException('Quản lý chi nhánh chỉ được cập nhật đơn hàng thuộc chi nhánh của mình', HttpStatus.FORBIDDEN),
      );
    });
  });
});
