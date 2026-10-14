import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller';
import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaymentController (Unit Tests)', () => {
  let controller: PaymentController;
  const SECRET = 'csm-payment-simulation-secret-key-2026';

  beforeEach(async () => {
    process.env.PAYMENT_SIMULATION = 'true';
    process.env.PAYMENT_SIMULATION_SECRET = SECRET;
    process.env.PUBLIC_GATEWAY_URL = 'http://localhost:8000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.INTERNAL_SECRET = 'test-internal-secret';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.PAYMENT_SIMULATION = 'true';
  });

  describe('1. Link sinh thanh toán (createPayment)', () => {
    it('Phải sinh paymentUrl chứa token JWT hợp lệ với orderId và hạn 10m', () => {
      const res = controller.createPayment({
        orderId: 'order-123',
        amount: 50000,
        method: 'MOMO',
      });

      expect(res.success).toBe(true);
      expect(res.paymentUrl).toContain('http://localhost:8000/api/v1/payments/simulate-success/order-123?token=');
      expect(res.token).toBeDefined();

      const decoded: any = jwt.verify(res.token, SECRET);
      expect(decoded.orderId).toBe('order-123');
      expect(decoded.exp - decoded.iat).toBe(600); // 10 phút = 600 giây
    });
  });

  describe('2. Kiểm soát trạng thái PAYMENT_SIMULATION=false -> 404', () => {
    it('GET simulateSuccessGet phải trả về 404 khi PAYMENT_SIMULATION=false', async () => {
      process.env.PAYMENT_SIMULATION = 'false';
      const mockRes: any = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };

      await expect(
        controller.simulateSuccessGet('order-123', 'any-token', {} as any, mockRes),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });

    it('POST simulateSuccessPost phải trả về 404 khi PAYMENT_SIMULATION=false', async () => {
      process.env.PAYMENT_SIMULATION = 'false';

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'any-token' }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });

    it('Phải trả 404 khi nhận header x-payment-simulation = false', async () => {
      process.env.PAYMENT_SIMULATION = 'true';
      const mockReq: any = { headers: { 'x-payment-simulation': 'false' } };

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'any-token' }, '', mockReq),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });
  });

  describe('3. Xác thực Token JWT (401/403)', () => {
    it('Phải trả về 401 khi không gửi token', async () => {
      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123' }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Thiếu token xác thực thanh toán', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 401 khi token sai chữ ký hoặc format', async () => {
      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'invalid.jwt.token' }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Token xác thực thanh toán không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 401 khi token đã hết hạn', async () => {
      const expiredToken = jwt.sign({ orderId: 'order-123' }, SECRET, { expiresIn: '-1s' });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: expiredToken }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Token xác thực thanh toán không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 403 khi token hợp lệ nhưng orderId không khớp', async () => {
      const tokenOrder456 = jwt.sign({ orderId: 'order-456' }, SECRET, { expiresIn: '10m' });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: tokenOrder456 }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Token không khớp với đơn hàng', HttpStatus.FORBIDDEN),
      );
    });
  });

  describe('4. Quy tắc nghiệp vụ đơn hàng (COD -> 400, CANCELLED -> 400)', () => {
    it('Phải từ chối 400 khi đơn hàng là COD', async () => {
      const validToken = jwt.sign({ orderId: 'order-cod' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-cod',
          total_amount: 100000,
          payment_method: 'COD',
          status: 'PENDING',
        },
      });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-cod', token: validToken }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Không thể thanh toán trực tuyến cho đơn hàng COD', HttpStatus.BAD_REQUEST),
      );
    });

    it('Phải từ chối 400 khi đơn hàng đã bị CANCELLED', async () => {
      const validToken = jwt.sign({ orderId: 'order-cancelled' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-cancelled',
          total_amount: 100000,
          payment_method: 'MOMO',
          status: 'CANCELLED',
        },
      });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-cancelled', token: validToken }, '', {} as any),
      ).rejects.toThrow(
        new HttpException('Không thể thanh toán đơn hàng đã bị hủy', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('5. Tính Idempotency (gọi nhiều lần không trừ kho lần 2)', () => {
    it('Đơn hàng đã PAID: trả về 200 ngay và không gọi cập nhật trạng thái', async () => {
      const validToken = jwt.sign({ orderId: 'order-paid' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-paid',
          total_amount: 100000,
          payment_method: 'MOMO',
          status: 'PAID',
        },
      });

      const res = await controller.simulateSuccessPost(
        { orderId: 'order-paid', token: validToken },
        '',
        {} as any,
      );

      expect(res.success).toBe(true);
      expect(res.idempotent).toBe(true);
      expect(res.status).toBe('PAID');
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });

    it('Đơn hàng đã CONFIRMED: trả về 200 ngay và không gọi cập nhật trạng thái', async () => {
      const validToken = jwt.sign({ orderId: 'order-confirmed' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-confirmed',
          total_amount: 100000,
          payment_method: 'ATM',
          status: 'CONFIRMED',
        },
      });

      const res = await controller.simulateSuccessPost(
        { orderId: 'order-confirmed', token: validToken },
        '',
        {} as any,
      );

      expect(res.success).toBe(true);
      expect(res.idempotent).toBe(true);
      expect(res.status).toBe('CONFIRMED');
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });
  });

  describe('6. Chuyển trạng thái khi PENDING (PENDING -> CONFIRMED -> PAID)', () => {
    it('Đơn PENDING: gọi chuyển CONFIRMED (trừ kho) và chuyển PAID', async () => {
      const validToken = jwt.sign({ orderId: 'order-pending' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-pending',
          total_amount: 100000,
          payment_method: 'MOMO',
          status: 'PENDING',
        },
      });

      mockedAxios.patch
        .mockResolvedValueOnce({ data: { id: 'order-pending', status: 'CONFIRMED' } })
        .mockResolvedValueOnce({ data: { id: 'order-pending', status: 'PAID' } });

      const res = await controller.simulateSuccessPost(
        { orderId: 'order-pending', token: validToken },
        '',
        {} as any,
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(res.idempotent).toBe(false);

      expect(mockedAxios.patch).toHaveBeenCalledTimes(2);
      expect(mockedAxios.patch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3004/orders/order-pending/status',
        { status: 'CONFIRMED' },
        { headers: { 'x-internal-secret': 'test-internal-secret' } },
      );
      expect(mockedAxios.patch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3004/orders/order-pending/status',
        { status: 'PAID' },
        { headers: { 'x-internal-secret': 'test-internal-secret' } },
      );
    });
  });

  describe('7. GET simulateSuccessGet hiển thị HTML mà KHÔNG đổi trạng thái', () => {
    it('Trả về HTML và không bao giờ gọi PATCH cập nhật trạng thái', async () => {
      const validToken = jwt.sign({ orderId: 'order-html' }, SECRET, { expiresIn: '10m' });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'order-html',
          total_amount: 250000,
          payment_method: 'MOMO',
          status: 'PENDING',
        },
      });

      let sentHtml = '';
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        type: jest.fn().mockReturnThis(),
        send: jest.fn().mockImplementation((html) => {
          sentHtml = html;
          return mockRes;
        }),
      };

      await controller.simulateSuccessGet('order-html', validToken, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.type).toHaveBeenCalledWith('html');
      expect(sentHtml).toContain('Mô phỏng Cổng Thanh toán');
      expect(sentHtml).toContain('#order-html');
      expect(sentHtml).toContain('Xác nhận thanh toán mô phỏng');
      // Tuyệt đối không thay đổi trạng thái trong GET
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });
  });
});
