import { Controller, Post, Body } from '@nestjs/common';

@Controller('notifications')
export class NotificationController {
  @Post('events')
  handleEvent(@Body() body: { event: string, payload: any }) {
    if (body.event === 'order_created') {
      console.log(`[NotificationService] NHẬN EVENT: ${body.event}`);
      console.log(`[NotificationService] Đang gửi Email & SMS xác nhận đơn hàng ${body.payload.orderId} cho User ${body.payload.userId}...`);
      // Giả lập delay gửi email
      setTimeout(() => {
        console.log(`[NotificationService] ✅ Gửi thông báo thành công cho đơn hàng ${body.payload.orderId}!`);
      }, 1000);
    }

    return { success: true };
  }
}
