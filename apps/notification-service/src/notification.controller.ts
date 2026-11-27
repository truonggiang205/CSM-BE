import { Controller, Post, Get, Body, BadRequestException } from '@nestjs/common';

/**
 * GHI CHÚ KIẾN TRÚC (C3 Specification):
 * Dịch vụ Thông báo (Notification Service) hiện đang hoạt động theo cơ chế MÔ PHỎNG (Simulation).
 * Trong môi trường hiện tại, sự kiện được nhận qua HTTP webhook và xử lý bất đồng bộ in-memory
 * thay vì kết nối trực tiếp đến cụm RabbitMQ/Kafka thực tế nhằm tối ưu tài nguyên phát triển cục bộ.
 */
@Controller('notifications')
export class NotificationController {
  private readonly newsletterSubscribers = new Set<string>();

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'notification-service', mode: 'simulation' };
  }

  @Post('newsletter/subscribe')
  subscribeNewsletter(@Body('email') email: string) {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException('Địa chỉ email không hợp lệ');
    }

    const alreadySubscribed = this.newsletterSubscribers.has(normalized);
    this.newsletterSubscribers.add(normalized);
    console.log(`[NotificationService] Newsletter subscribe: ${normalized} (mới: ${!alreadySubscribed})`);

    return {
      success: true,
      alreadySubscribed,
      email: normalized,
      message: alreadySubscribed
        ? 'Email này đã đăng ký nhận tin trước đó!'
        : 'Đăng ký nhận ưu đãi thành công!',
    };
  }

  @Get('newsletter/subscribers')
  getNewsletterSubscribers() {
    return {
      total: this.newsletterSubscribers.size,
      emails: Array.from(this.newsletterSubscribers),
    };
  }

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
