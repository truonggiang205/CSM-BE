import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Order Service Saga Rollback Test (Ep loi DB sau khi reserve-stock)', () => {
  let orderController: OrderController;
  let orderRepository: any;
  let orderItemRepository: any;

  beforeEach(async () => {
    process.env.INTERNAL_SECRET = 'unit-test-internal-secret-min-32-chars!!';
    orderRepository = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    orderItemRepository = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
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

  it('Sau khi reserve-stock thanh cong, neu luu DB bi loi -> BAT BUOC phai goi release-stock bu tru va tra ve HTTP 500', async () => {
    const mockReq = {
      user: { id: 'usr-test-123', role: 'CUSTOMER' },
      headers: {},
    };

    const orderDto = {
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 2 }],
      shippingAddress: '123 Le Loi, Quan 1, TP.HCM',
      paymentMethod: 'COD',
    };

    // 1. Mock xác thực chi nhánh thành công
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/branches/')) {
        return Promise.resolve({
          data: { id: 'br-01', name: 'Chi nhánh Q1' },
          status: 200,
        } as any);
      }
      if (url.includes('/products/')) {
        return Promise.resolve({
          data: { id: 'prod-001', name: 'Trà Sữa Trân Châu', base_price: 35000 },
          status: 200,
        } as any);
      }
      return Promise.reject(new Error('Unknown GET URL'));
    });

    // 2. Mock reserve-stock THÀNH CÔNG (Inventory đã giữ 2 sản phẩm)
    let reserveStockCalledWith: any = null;
    let releaseStockCalledWith: any = null;

    mockedAxios.post.mockImplementation((url: string, body: any) => {
      if (url.includes('/inventory/reserve-stock')) {
        reserveStockCalledWith = body;
        return Promise.resolve({
          data: { success: true, message: 'Đã giữ hàng tạm thời thành công' },
          status: 200,
        } as any);
      }
      if (url.includes('/inventory/release-stock')) {
        releaseStockCalledWith = body;
        return Promise.resolve({
          data: { success: true, message: 'Đã giải phóng hàng giữ tạm thành công' },
          status: 200,
        } as any);
      }
      return Promise.resolve({ data: {}, status: 200 } as any);
    });

    // 3. ÉP LỖI DATABASE: Giả lập lưu đơn hàng vào DB thất bại (ví dụ: Disk full, DB crash, Unique Constraint Error)
    const dbSimulatedError = new Error('SIMULATED_DATABASE_FAILURE: Deadlock / Connection Lost');
    orderRepository.save.mockRejectedValueOnce(dbSimulatedError);

    // 4. Thực thi tạo đơn và kỳ vọng ném ra lỗi HTTP 500
    await expect(orderController.createOrder(mockReq, orderDto)).rejects.toThrow(
      new HttpException('Lỗi hệ thống khi tạo đơn hàng. Đã hoàn lại tồn kho.', HttpStatus.INTERNAL_SERVER_ERROR),
    );

    // 5. XÁC NHẬN SAGA BÙ TRỪ:
    // (a) reserve-stock đã được gọi thành công trước đó
    expect(reserveStockCalledWith).toBeDefined();
    expect(reserveStockCalledWith.branchId).toBe('br-01');
    expect(reserveStockCalledWith.items).toEqual([{ productId: 'prod-001', quantity: 2 }]);
    const targetOrderId = reserveStockCalledWith.referenceId;
    expect(targetOrderId).toBeTruthy();

    // (b) release-stock BẮT BUỘC ĐÃ ĐƯỢC GỌI để giải phóng đúng số lượng hàng và referenceId
    expect(releaseStockCalledWith).toBeDefined();
    expect(releaseStockCalledWith.branchId).toBe('br-01');
    expect(releaseStockCalledWith.referenceId).toBe(targetOrderId);
    expect(releaseStockCalledWith.items).toEqual([{ productId: 'prod-001', quantity: 2 }]);

    console.log('✅ XÁC NHẬN SAGA THÀNH CÔNG: Khi DB lỗi sau khi reserve, release-stock đã được gọi với:');
    console.log('   - branchId:', releaseStockCalledWith.branchId);
    console.log('   - referenceId:', releaseStockCalledWith.referenceId);
    console.log('   - items hoàn kho:', releaseStockCalledWith.items);
  });

  it('Khi claim voucher bị timeout / thất bại -> BAT BUOC phai xoa order, release-stock VA release voucher bu tru', async () => {
    const mockReq = {
      user: { id: 'usr-test-456', role: 'CUSTOMER' },
      headers: {},
    };

    const orderDto = {
      branchId: 'br-01',
      items: [{ productId: 'prod-001', quantity: 1 }],
      shippingAddress: '456 Nguyen Luong Bang, Quan 7, TP.HCM',
      paymentMethod: 'COD',
      voucherCode: 'VOUCHER_SAGA_TEST',
    };

    // 1. Mock xác thực chi nhánh, sản phẩm, và voucher hợp lệ
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/branches/')) {
        return Promise.resolve({ data: { id: 'br-01', name: 'Chi nhánh Q1' }, status: 200 } as any);
      }
      if (url.includes('/products/')) {
        return Promise.resolve({ data: { id: 'prod-001', name: 'Trà Sữa Trân Châu', base_price: 50000 }, status: 200 } as any);
      }
      return Promise.reject(new Error('Unknown GET URL'));
    });

    let releaseStockCalled = false;
    let releaseVoucherCalled = false;
    let releasedVoucherCode = '';
    orderRepository.delete = jest.fn().mockResolvedValue({ affected: 1 });
    orderRepository.save = jest.fn().mockImplementation((order) => Promise.resolve({ ...order, id: 'ord-test-saga-001' }));

    mockedAxios.post.mockImplementation((url: string, body: any) => {
      if (url.includes('/inventory/reserve-stock')) {
        return Promise.resolve({ data: { success: true }, status: 200 } as any);
      }
      if (url.includes('/discounts/vouchers/validate')) {
        return Promise.resolve({ data: { valid: true, discountAmount: 10000 }, status: 200 } as any);
      }
      if (url.includes('/discounts/vouchers/claim')) {
        // Giả lập claim bị timeout 5s hoặc lỗi mạng
        return Promise.reject(new Error('ECONNABORTED: timeout of 5000ms exceeded'));
      }
      if (url.includes('/inventory/release-stock')) {
        releaseStockCalled = true;
        return Promise.resolve({ data: { success: true }, status: 200 } as any);
      }
      if (url.includes('/discounts/vouchers/release')) {
        releaseVoucherCalled = true;
        releasedVoucherCode = body.code;
        return Promise.resolve({ data: { success: true }, status: 200 } as any);
      }
      return Promise.resolve({ data: {}, status: 200 } as any);
    });

    // 2. Thực thi tạo đơn và kỳ vọng ném ra HTTP 400 Bad Request
    await expect(orderController.createOrder(mockReq, orderDto as any)).rejects.toThrow(
      HttpException,
    );

    // 3. XÁC NHẬN TOÀN BỘ SAGA BÙ TRỪ:
    // (a) Đơn hàng tạm trong DB bị xoá
    expect(orderRepository.delete).toHaveBeenCalledWith('ord-test-saga-001');
    // (b) Kho hàng được giải phóng
    expect(releaseStockCalled).toBe(true);
    // (c) Voucher được gọi bù trừ release để hoàn lại lượt dùng cho user
    expect(releaseVoucherCalled).toBe(true);
    expect(releasedVoucherCode).toBe('VOUCHER_SAGA_TEST');

    console.log('✅ XÁC NHẬN SAGA BÙ TRỪ TIMEOUT THÀNH CÔNG: Order đã xoá, kho đã hoàn, voucher đã release.');
  });
  it('Giờ Vàng: chỉ phần được cấp suất tính giá sale, phần vượt giới hạn tính giá gốc; lỗi giữ kho -> trả suất', async () => {
    const mockReq = { user: { id: 'usr-fs-1', role: 'CUSTOMER' }, headers: {} };
    const orderDto = {
      branchId: 'br-01',
      items: [{ productId: 'prod-fs', quantity: 5 }],
      shippingAddress: '1 Le Loi',
      paymentMethod: 'COD',
    };
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/branches/')) return Promise.resolve({ data: { id: 'br-01' } } as any);
      if (url.includes('/products/'))
        return Promise.resolve({ data: { id: 'prod-fs', name: 'Mì ly', base_price: 10000 } } as any);
      return Promise.reject(new Error('Unknown GET URL'));
    });
    const calls: Record<string, any[]> = {};
    let failReserve = false;
    mockedAxios.post.mockImplementation((url: string, body: any) => {
      const key = url.replace(/^https?:\/\/[^/]+/, '');
      (calls[key] = calls[key] || []).push(body);
      if (url.includes('/flash-sales/claim')) {
        // Ca còn 2 suất cho khách này -> 2 món giá sale, 3 món giá gốc
        return Promise.resolve({ data: { allocations: [{ productId: 'prod-fs', saleQuantity: 2, salePrice: 7000 }] } } as any);
      }
      if (url.includes('/inventory/reserve-stock')) {
        return failReserve
          ? Promise.reject({ response: { data: { message: 'Hết hàng' } } })
          : Promise.resolve({ data: { success: true } } as any);
      }
      return Promise.resolve({ data: { success: true } } as any);
    });
    orderRepository.save = jest.fn().mockImplementation((o) => Promise.resolve({ ...o }));

    await orderController.createOrder(mockReq, orderDto as any);
    const saved = orderRepository.save.mock.calls[0][0];
    const lines = saved.items.map((i: any) => [i.price_snapshot, i.quantity]);
    expect(lines).toEqual([
      [7000, 2],
      [10000, 3],
    ]);
    expect(saved.subtotal_amount).toBe(7000 * 2 + 10000 * 3);
    // Kho vẫn giữ đủ 5 món (gộp theo sản phẩm)
    expect(calls['/inventory/reserve-stock'][0].items).toEqual([{ productId: 'prod-fs', quantity: 5 }]);

    failReserve = true;
    await expect(orderController.createOrder(mockReq, orderDto as any)).rejects.toThrow(HttpException);
    expect(calls['/flash-sales/release']?.length).toBe(1);
  });
});
