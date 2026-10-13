import { Controller, Post, Get, Body, Param, Res, HttpStatus, HttpException } from '@nestjs/common';
import { Response } from 'express';
import axios from 'axios';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3004';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'csm-super-secure-internal-secret-token';
const GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8000/api/v1';

@Controller('payments')
export class PaymentController {
  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'payment-service' };
  }

  @Post('create')
  createPayment(@Body() body: { orderId: string; amount: number; method: string }) {
    console.log(`[PaymentService] Yêu cầu tạo thanh toán cho Order: ${body.orderId}, Method: ${body.method}`);

    // Đường dẫn mô phỏng thanh toán thành công qua API Gateway
    const paymentUrl = `${GATEWAY_URL}/payments/simulate-success/${body.orderId}`;

    let externalMockUrl = '';
    if (body.method === 'MOMO') {
      externalMockUrl = `https://test-payment.momo.vn/v2/gateway/pay?orderId=${body.orderId}&amount=${body.amount}`;
    } else if (body.method === 'ATM') {
      externalMockUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=${body.amount * 100}&vnp_TxnRef=${body.orderId}`;
    }

    return {
      success: true,
      message: 'Đã tạo link thanh toán',
      paymentUrl,
      externalMockUrl,
    };
  }

  // Endpoint mô phỏng thanh toán thành công (GET từ trình duyệt redirect)
  @Get('simulate-success/:orderId')
  async simulateSuccessGet(@Param('orderId') orderId: string, @Res() res: Response) {
    try {
      await this.processPaymentSuccess(orderId);

      const html = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="2;url=http://localhost:3000/orders/${orderId}">
          <title>Thanh toán thành công</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAF9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #fff; padding: 40px; border-radius: 20px; border: 1px solid #E2EBE6; box-shadow: 0 4px 20px rgba(78, 159, 118, 0.08); text-align: center; max-width: 450px; }
            .icon { width: 64px; height: 64px; background: #EAF5EF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; color: #4E9F76; }
            h2 { color: #22312A; margin: 0 0 10px; font-size: 22px; }
            p { color: #64756D; font-size: 14px; margin: 0 0 20px; }
            .order-id { font-weight: bold; color: #387B5B; }
            .btn { display: inline-block; padding: 12px 24px; background: #4E9F76; color: #fff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h2>Thanh toán thành công!</h2>
            <p>Đơn hàng <span class="order-id">#${orderId}</span> đã được ghi nhận thanh toán trực tuyến.</p>
            <p>Hệ thống đang tự động chuyển hướng về trang đơn hàng của bạn...</p>
            <a href="http://localhost:3000/orders/${orderId}" class="btn">Xem chi tiết đơn hàng</a>
          </div>
        </body>
        </html>
      `;
      return res.status(HttpStatus.OK).send(html);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: err.message || 'Mô phỏng thanh toán thất bại',
      });
    }
  }

  // Endpoint mô phỏng thanh toán thành công (POST từ API test / client)
  @Post('simulate-success')
  async simulateSuccessPost(@Body() body: { orderId: string }) {
    if (!body.orderId) {
      throw new HttpException('orderId không được để trống', HttpStatus.BAD_REQUEST);
    }
    const result = await this.processPaymentSuccess(body.orderId);
    return {
      success: true,
      message: 'Mô phỏng thanh toán online thành công!',
      orderId: body.orderId,
      status: 'PAID',
      details: result,
    };
  }

  private async processPaymentSuccess(orderId: string) {
    console.log(`[PaymentService] Đang xử lý callback thanh toán thành công cho đơn: ${orderId}`);

    // 1. Lấy thông tin đơn hàng hiện tại từ Order Service qua đường nội bộ
    let order: any;
    try {
      const orderRes = await axios.get(`${ORDER_SERVICE_URL}/orders/${orderId}`, {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      order = orderRes.data;
    } catch (err: any) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}: ${err.message}`, HttpStatus.NOT_FOUND);
    }

    if (!order) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}`, HttpStatus.NOT_FOUND);
    }

    // 2. Chuyển đổi theo máy trạng thái hợp lệ
    // Nếu đang PENDING: PENDING -> CONFIRMED (để trừ tồn kho) -> PAID
    if (order.status === 'PENDING') {
      console.log(`[PaymentService] Chuyển đơn ${orderId} từ PENDING -> CONFIRMED...`);
      await axios.patch(
        `${ORDER_SERVICE_URL}/orders/${orderId}/status`,
        { status: 'CONFIRMED' },
        { headers: { 'x-internal-secret': INTERNAL_SECRET } },
      );

      console.log(`[PaymentService] Chuyển đơn ${orderId} từ CONFIRMED -> PAID...`);
      const paidRes = await axios.patch(
        `${ORDER_SERVICE_URL}/orders/${orderId}/status`,
        { status: 'PAID' },
        { headers: { 'x-internal-secret': INTERNAL_SECRET } },
      );
      return paidRes.data;
    } else if (order.status === 'CONFIRMED') {
      console.log(`[PaymentService] Chuyển đơn ${orderId} từ CONFIRMED -> PAID...`);
      const paidRes = await axios.patch(
        `${ORDER_SERVICE_URL}/orders/${orderId}/status`,
        { status: 'PAID' },
        { headers: { 'x-internal-secret': INTERNAL_SECRET } },
      );
      return paidRes.data;
    } else if (order.status === 'PAID') {
      console.log(`[PaymentService] Đơn hàng ${orderId} đã ở trạng thái PAID trước đó.`);
      return order;
    } else {
      throw new HttpException(
        `Không thể thanh toán đơn hàng đang ở trạng thái ${order.status}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
