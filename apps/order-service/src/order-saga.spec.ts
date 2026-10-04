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
    orderRepository = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    orderItemRepository = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
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
});
