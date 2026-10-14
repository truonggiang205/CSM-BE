import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController, escapeHtml } from './payment.controller';
import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaymentController (Unit Tests)', () => {
  let controller: PaymentController;
  const SECRET = 'csm-payment-simulation-secret-key-2026';
  const JWT_SECRET = 'csm-super-secret-key-production-change-me';

  beforeEach(async () => {
    process.env.PAYMENT_SIMULATION = 'true';
    process.env.PAYMENT_SIMULATION_SECRET = SECRET;
    process.env.PUBLIC_GATEWAY_URL = 'http://localhost:8000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.INTERNAL_SECRET = 'test-internal-secret';
    process.env.JWT_SECRET = JWT_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.PAYMENT_SIMULATION = 'true';
  });

  describe('1. Link sinh thanh toán (POST /payments/create) & Phân quyền', () => {
    it('Phải từ chối 401 khi không có JWT / xác thực danh tính', async () => {
      const mockReq: any = { headers: {} };
      await expect(
        controller.createPayment({ orderId: 'order-123', amount: 50000, method: 'MOMO' }, mockReq),
      ).rejects.toThrow(new HttpException('Yêu cầu xác thực tài khoản (JWT)', HttpStatus.UNAUTHORIZED));
    });

    it('Phải từ chối 403 khi khách hàng CUSTOMER tạo thanh toán cho đơn hàng của người khác', async () => {
      const mockReq: any = {
        headers: {
          'x-user-id': 'usr-other',
          'x-user-role': 'CUSTOMER',
        },
      };
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 'order-123', user_id: 'usr-owner', total_amount: 50000 },
      });

      await expect(
        controller.createPayment({ orderId: 'order-123', amount: 50000, method: 'MOMO' }, mockReq),
      ).rejects.toThrow(
        new HttpException('Bạn không có quyền tạo thanh toán cho đơn hàng của người khác', HttpStatus.FORBIDDEN),
      );
    });

    it('Phải cho phép chủ đơn hàng (owner CUSTOMER) tạo link thanh toán hợp lệ', async () => {
      const mockReq: any = {
        headers: {
          'x-user-id': 'usr-owner',
          'x-user-role': 'CUSTOMER',
        },
      };
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 'order-123', user_id: 'usr-owner', total_amount: 50000 },
      });

      const res = await controller.createPayment(
        { orderId: 'order-123', amount: 50000, method: 'MOMO' },
        mockReq,
      );

      expect(res.success).toBe(true);
      expect(res.paymentUrl).toContain('http://localhost:8000/api/v1/payments/simulate-success/order-123?token=');
      expect(res.token).toBeDefined();

      const decoded: any = jwt.verify(res.token, SECRET);
      expect(decoded.orderId).toBe('order-123');
      expect(decoded.exp - decoded.iat).toBe(600); // 10 phút
    });

    it('Phải cho phép ADMIN hoặc cuộc gọi nội bộ (x-internal-secret) tạo link thanh toán', async () => {
      const mockReq: any = {
        headers: {
          'x-internal-secret': 'test-internal-secret',
        },
      };

      const res = await controller.createPayment(
        { orderId: 'order-admin', amount: 100000, method: 'ATM' },
        mockReq,
      );

      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();
    });
  });

  describe('2. Kiểm soát trạng thái PAYMENT_SIMULATION=false -> 404 (Không thể bypass bằng cờ request)', () => {
    it('GET simulateSuccessGet phải trả về 404 khi server đặt PAYMENT_SIMULATION=false', async () => {
      process.env.PAYMENT_SIMULATION = 'false';
      const mockRes: any = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };

      await expect(
        controller.simulateSuccessGet('order-123', 'any-token', {} as any, mockRes),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });

    it('POST simulateSuccessPost phải trả về 404 khi server đặt PAYMENT_SIMULATION=false', async () => {
      process.env.PAYMENT_SIMULATION = 'false';

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'any-token' }, ''),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });

    it('Request cố tình gửi cờ bật giả (x-payment-simulation: true) VẪN PHẢI NHẬN 404 khi server tắt', async () => {
      process.env.PAYMENT_SIMULATION = 'false';
      const mockReq: any = {
        headers: {
          'x-payment-simulation': 'true',
          'simulate-enabled': 'true',
        },
        query: {
          simulate: 'true',
          enabled: 'true',
        },
      };
      const mockRes: any = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };

      await expect(
        controller.simulateSuccessGet('order-123', 'any-token', mockReq, mockRes),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'any-token' }, ''),
      ).rejects.toThrow(
        new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND),
      );
    });
  });

  describe('3. Xác thực Token JWT (401/403)', () => {
    it('Phải trả về 401 khi không gửi token', async () => {
      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123' }, ''),
      ).rejects.toThrow(
        new HttpException('Thiếu token xác thực thanh toán', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 401 khi token sai chữ ký hoặc format', async () => {
      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: 'invalid.jwt.token' }, ''),
      ).rejects.toThrow(
        new HttpException('Token xác thực thanh toán không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 401 khi token đã hết hạn', async () => {
      const expiredToken = jwt.sign({ orderId: 'order-123' }, SECRET, { expiresIn: '-1s' });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: expiredToken }, ''),
      ).rejects.toThrow(
        new HttpException('Token xác thực thanh toán không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED),
      );
    });

    it('Phải trả về 403 khi token hợp lệ nhưng orderId không khớp', async () => {
      const tokenOrder456 = jwt.sign({ orderId: 'order-456' }, SECRET, { expiresIn: '10m' });

      await expect(
        controller.simulateSuccessPost({ orderId: 'order-123', token: tokenOrder456 }, ''),
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
        controller.simulateSuccessPost({ orderId: 'order-cod', token: validToken }, ''),
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
        controller.simulateSuccessPost({ orderId: 'order-cancelled', token: validToken }, ''),
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

  describe('7. GET simulateSuccessGet hiển thị HTML, Escape chống XSS & KHÔNG đổi trạng thái', () => {
    it('Phải escape các ký tự đặc biệt XSS và không đổi trạng thái đơn', async () => {
      const maliciousOrderId = 'order-<script>alert(1)</script>';
      const validToken = jwt.sign({ orderId: maliciousOrderId }, SECRET, { expiresIn: '10m' });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: maliciousOrderId,
          total_amount: 250000,
          payment_method: 'MOMO"><img src=x onerror=alert(1)>',
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

      await controller.simulateSuccessGet(maliciousOrderId, validToken, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.type).toHaveBeenCalledWith('html');

      // Chứng minh các ký tự XSS đã bị escape triệt để
      expect(sentHtml).not.toContain('<script>alert(1)</script>');
      expect(sentHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(sentHtml).not.toContain('<img src=x');
      expect(sentHtml).toContain('&lt;img src=x');

      // Tuyệt đối không thay đổi trạng thái trong GET
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });

    it('Hàm escapeHtml phải chuyển đổi chính xác các ký tự đặc biệt', () => {
      expect(escapeHtml('<div class="test" data-id=\'1\'>&</div>')).toBe(
        '&lt;div class=&quot;test&quot; data-id=&#39;1&#39;&gt;&amp;&lt;/div&gt;',
      );
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });
});
