import { Controller, Post, Body } from '@nestjs/common';

@Controller('payments')
export class PaymentController {
  @Post('create')
  createPayment(@Body() body: { orderId: string, amount: number, method: string }) {
    console.log(`[PaymentService] Yêu cầu tạo thanh toán cho Order: ${body.orderId}, Method: ${body.method}`);
    
    // Giả lập logic sinh URL thanh toán của MoMo/VNPay
    let paymentUrl = '';
    if (body.method === 'MOMO') {
      paymentUrl = `https://test-payment.momo.vn/v2/gateway/pay?orderId=${body.orderId}&amount=${body.amount}`;
    } else if (body.method === 'ATM') {
      paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=${body.amount * 100}&vnp_TxnRef=${body.orderId}`;
    }

    return {
      success: true,
      message: 'Đã tạo link thanh toán',
      paymentUrl
    };
  }
}
