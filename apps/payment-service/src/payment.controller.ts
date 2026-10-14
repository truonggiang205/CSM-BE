import { Controller, Post, Get, Body, Param, Query, Req, Res, HttpStatus, HttpException, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

const getOrderServiceUrl = () => process.env.ORDER_SERVICE_URL || 'http://localhost:3004';
const getInternalSecret = () => process.env.INTERNAL_SECRET || 'csm-super-secure-internal-secret-token';
const getPublicGatewayUrl = () => (process.env.PUBLIC_GATEWAY_URL || 'http://localhost:8000').replace(/\/+$/, '');
const getFrontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
const getPaymentSimulationSecret = () => process.env.PAYMENT_SIMULATION_SECRET || 'csm-payment-simulation-secret-key-2026';

@Controller('payments')
export class PaymentController {
  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'payment-service' };
  }

  // Helper kiểm tra cờ PAYMENT_SIMULATION
  private ensureSimulationEnabled(req?: Request) {
    const isGlobalFalse = process.env.PAYMENT_SIMULATION === 'false';
    const isHeaderDisabled = req?.headers?.['x-payment-simulation'] === 'false';
    const isQueryDisabled = req?.query?.simulate_disabled === 'true';

    if (isGlobalFalse || isHeaderDisabled || isQueryDisabled) {
      throw new HttpException('Chức năng mô phỏng thanh toán đã bị vô hiệu hóa', HttpStatus.NOT_FOUND);
    }
  }

  // Helper xác thực token JWT mô phỏng
  private verifySimulationToken(token: string | undefined, orderId: string) {
    if (!token) {
      throw new HttpException('Thiếu token xác thực thanh toán', HttpStatus.UNAUTHORIZED);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, getPaymentSimulationSecret());
    } catch (err: any) {
      throw new HttpException('Token xác thực thanh toán không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED);
    }

    if (!decoded || decoded.orderId !== orderId) {
      throw new HttpException('Token không khớp với đơn hàng', HttpStatus.FORBIDDEN);
    }

    return decoded;
  }

  @Post('create')
  createPayment(@Body() body: { orderId: string; amount: number; method: string }) {
    console.log(`[PaymentService] Yêu cầu tạo thanh toán cho Order: ${body.orderId}, Method: ${body.method}`);

    // Ký token JWT mô phỏng thanh toán riêng biệt, hết hạn sau 10 phút
    const simulationToken = jwt.sign(
      { orderId: body.orderId },
      getPaymentSimulationSecret(),
      { expiresIn: '10m' },
    );

    // Dùng PUBLIC_GATEWAY_URL (mặc định http://localhost:8000) và gắn token xác thực
    const paymentUrl = `${getPublicGatewayUrl()}/api/v1/payments/simulate-success/${body.orderId}?token=${simulationToken}`;

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
      token: simulationToken,
    };
  }

  // Endpoint hiển thị trang HTML xác nhận (GET từ trình duyệt redirect) - KHÔNG ĐỔI TRẠNG THÁI
  @Get('simulate-success/:orderId')
  async simulateSuccessGet(
    @Param('orderId') orderId: string,
    @Query('token') queryToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.ensureSimulationEnabled(req);

    // Xác thực token JWT
    this.verifySimulationToken(queryToken, orderId);

    // Lấy thông tin đơn hàng hiện tại từ Order Service qua đường nội bộ
    let order: any;
    try {
      const orderRes = await axios.get(`${getOrderServiceUrl()}/orders/${orderId}`, {
        headers: { 'x-internal-secret': getInternalSecret() },
      });
      order = orderRes.data;
    } catch (err: any) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}`, HttpStatus.NOT_FOUND);
    }

    if (!order) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}`, HttpStatus.NOT_FOUND);
    }

    const orderAmount = Number(order.total_amount || 0).toLocaleString('vi-VN');
    const orderMethod = order.payment_method || 'Trực tuyến';
    const isPaid = order.status === 'PAID';
    const isCancelled = order.status === 'CANCELLED';
    const frontendUrl = getFrontendUrl();

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mô phỏng Cổng Thanh toán</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAF9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #fff; padding: 36px; border-radius: 20px; border: 1px solid #E2EBE6; box-shadow: 0 4px 20px rgba(78, 159, 118, 0.08); text-align: center; max-width: 460px; width: 100%; }
          .icon { width: 64px; height: 64px; background: #EAF5EF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; color: #4E9F76; }
          h2 { color: #22312A; margin: 0 0 8px; font-size: 22px; font-weight: 700; }
          p { color: #64756D; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
          .order-box { background: #F4F8F6; border: 1px solid #DFEBE4; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: left; font-size: 13px; }
          .order-row { display: flex; justify-content: space-between; margin-bottom: 8px; color: #4D5E56; }
          .order-row:last-child { margin-bottom: 0; }
          .order-id { font-weight: bold; color: #2F6B4F; }
          .order-price { font-weight: 700; color: #278056; font-size: 15px; }
          .status-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #EAF5EF; color: #2E7D32; }
          .status-badge.cancelled { background: #FFEBEE; color: #C62828; }
          .btn { display: block; width: 100%; padding: 14px; background: #4E9F76; color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: background 0.2s; box-sizing: border-box; text-decoration: none; }
          .btn:hover { background: #3E8561; }
          .btn:disabled { background: #B3C8BD; cursor: not-allowed; }
          .btn-secondary { background: #EEF3F0; color: #3A4C43; margin-top: 10px; }
          .btn-secondary:hover { background: #DFEBE4; }
          #statusMsg { margin-top: 16px; font-size: 13px; font-weight: 600; min-height: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">💳</div>
          <h2>Mô phỏng Cổng Thanh toán</h2>
          <p>Xác nhận giao dịch thanh toán trực tuyến cho đơn hàng của bạn.</p>

          <div class="order-box">
            <div class="order-row">
              <span>Mã đơn hàng:</span>
              <span class="order-id">#${orderId}</span>
            </div>
            <div class="order-row">
              <span>Phương thức:</span>
              <span><strong>${orderMethod}</strong></span>
            </div>
            <div class="order-row">
              <span>Số tiền:</span>
              <span class="order-price">${orderAmount} đ</span>
            </div>
            <div class="order-row">
              <span>Trạng thái:</span>
              <span class="status-badge ${isCancelled ? 'cancelled' : ''}">${order.status}</span>
            </div>
          </div>

          ${
            isPaid
              ? `
            <p style="color: #2E7D32; font-weight: 600;">✓ Đơn hàng này đã hoàn tất thanh toán trước đó.</p>
            <a href="${frontendUrl}/orders/${orderId}" class="btn">Xem chi tiết đơn hàng</a>
          `
              : isCancelled
              ? `
            <p style="color: #C62828; font-weight: 600;">Đơn hàng đã bị hủy, không thể tiếp tục thanh toán.</p>
            <a href="${frontendUrl}/orders/${orderId}" class="btn btn-secondary">Quay lại đơn hàng</a>
          `
              : `
            <button id="payBtn" onclick="confirmPayment()" class="btn">Xác nhận thanh toán mô phỏng</button>
            <a href="${frontendUrl}/orders/${orderId}" class="btn btn-secondary">Hủy bỏ và quay lại</a>
            <div id="statusMsg"></div>
          `
          }
        </div>

        <script>
          async function confirmPayment() {
            const btn = document.getElementById('payBtn');
            const msg = document.getElementById('statusMsg');
            btn.disabled = true;
            btn.innerText = 'Đang xử lý giao dịch...';
            msg.innerHTML = '<span style="color:#64756D">Đang kết nối API Gateway...</span>';

            try {
              const res = await fetch('/api/v1/payments/simulate-success', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: '${orderId}',
                  token: '${queryToken || ''}'
                })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                msg.innerHTML = '<span style="color:#2E7D32">✓ Thanh toán thành công! Đang chuyển hướng...</span>';
                setTimeout(() => {
                  window.location.href = '${frontendUrl}/orders/${orderId}';
                }, 1500);
              } else {
                btn.disabled = false;
                btn.innerText = 'Thử lại';
                msg.innerHTML = '<span style="color:#C62828">Lỗi: ' + (data.message || 'Thanh toán thất bại') + '</span>';
              }
            } catch (err) {
              btn.disabled = false;
              btn.innerText = 'Thử lại';
              msg.innerHTML = '<span style="color:#C62828">Không thể kết nối máy chủ thanh toán</span>';
            }
          }
        </script>
      </body>
      </html>
    `;

    return res.status(HttpStatus.OK).type('html').send(html);
  }

  // Endpoint xử lý mô phỏng thanh toán (POST)
  @Post('simulate-success')
  @HttpCode(HttpStatus.OK)
  async simulateSuccessPost(
    @Body() body: { orderId: string; token?: string },
    @Query('token') queryToken: string,
    @Req() req: Request,
  ) {
    this.ensureSimulationEnabled(req);

    if (!body || !body.orderId) {
      throw new HttpException('orderId không được để trống', HttpStatus.BAD_REQUEST);
    }

    const token = body.token || queryToken;
    this.verifySimulationToken(token, body.orderId);

    const result = await this.processPaymentSuccess(body.orderId);
    return {
      success: true,
      message: result.idempotent
        ? `Đơn hàng đã được xác nhận/thanh toán trước đó (${result.status})`
        : 'Mô phỏng thanh toán online thành công!',
      orderId: body.orderId,
      status: result.status,
      idempotent: Boolean(result.idempotent),
      details: result,
    };
  }

  private async processPaymentSuccess(orderId: string) {
    console.log(`[PaymentService] Đang xử lý thanh toán mô phỏng cho đơn hàng: ${orderId}`);

    // 1. Lấy thông tin đơn hàng hiện tại từ Order Service qua đường nội bộ
    let order: any;
    try {
      const orderRes = await axios.get(`${getOrderServiceUrl()}/orders/${orderId}`, {
        headers: { 'x-internal-secret': getInternalSecret() },
      });
      order = orderRes.data;
    } catch (err: any) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}: ${err.message}`, HttpStatus.NOT_FOUND);
    }

    if (!order) {
      throw new HttpException(`Không tìm thấy đơn hàng ${orderId}`, HttpStatus.NOT_FOUND);
    }

    // 2. Kiểm tra phương thức thanh toán: từ chối COD
    const paymentMethod = (order.payment_method || order.paymentMethod || '').toUpperCase();
    if (paymentMethod === 'COD') {
      throw new HttpException('Không thể thanh toán trực tuyến cho đơn hàng COD', HttpStatus.BAD_REQUEST);
    }

    // 3. Kiểm tra trạng thái huỷ: từ chối 400
    if (order.status === 'CANCELLED') {
      throw new HttpException('Không thể thanh toán đơn hàng đã bị hủy', HttpStatus.BAD_REQUEST);
    }

    // 4. Kiểm tra tính Idempotent: Nếu đã CONFIRMED hoặc PAID -> trả 200 ngay, không trừ kho lần 2
    if (order.status === 'PAID' || order.status === 'CONFIRMED') {
      console.log(`[PaymentService] Đơn hàng ${orderId} đã ở trạng thái ${order.status}. Trả kết quả idempotent không thay đổi trạng thái.`);
      return {
        idempotent: true,
        status: order.status,
        order,
      };
    }

    // 5. Nếu đang PENDING: Chuyển PENDING -> CONFIRMED (kích hoạt saga trừ kho) -> PAID
    if (order.status === 'PENDING') {
      console.log(`[PaymentService] Chuyển đơn ${orderId} từ PENDING -> CONFIRMED...`);
      await axios.patch(
        `${getOrderServiceUrl()}/orders/${orderId}/status`,
        { status: 'CONFIRMED' },
        { headers: { 'x-internal-secret': getInternalSecret() } },
      );

      console.log(`[PaymentService] Chuyển đơn ${orderId} từ CONFIRMED -> PAID...`);
      const paidRes = await axios.patch(
        `${getOrderServiceUrl()}/orders/${orderId}/status`,
        { status: 'PAID' },
        { headers: { 'x-internal-secret': getInternalSecret() } },
      );

      return {
        idempotent: false,
        status: 'PAID',
        order: paidRes.data,
      };
    }

    throw new HttpException(
      `Không thể thanh toán đơn hàng đang ở trạng thái ${order.status}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
