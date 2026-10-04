import { Controller, Get, Post, Patch, Body, Param, HttpException, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006';

interface CreateOrderDto {
  branchId: string | number;
  items: Array<{ productId: string | number; quantity: number; price: number; productName: string }>;
  shippingAddress: string;
  paymentMethod: string;
}

@Controller('orders')
export class OrderController {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const { branchId, items, shippingAddress, paymentMethod } = dto;
    const userId = req.user?.id || req.headers['x-user-id'] || 'anonymous';
    const orderId = randomUUID();

    if (!items || items.length === 0) {
      throw new HttpException('Đơn hàng phải có ít nhất 1 sản phẩm', HttpStatus.BAD_REQUEST);
    }

    // --- BƯỚC 1: SAGA - GIỮ HÀNG TỒN KHO TẠM THỜI (RESERVE STOCK) ---
    try {
      console.log(`[OrderService] Gọi Inventory Service (${INVENTORY_SERVICE_URL}) để giữ kho (reserve-stock)...`);
      const reserveRes = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/reserve-stock`, {
        branchId: branchId.toString(),
        referenceId: orderId,
        items: items.map(i => ({ productId: i.productId.toString(), quantity: i.quantity })),
      });

      if (!reserveRes.data.success) {
        throw new HttpException('Không thể giữ hàng trong kho', HttpStatus.BAD_REQUEST);
      }
    } catch (err: any) {
      throw new HttpException(
        err.response?.data?.message || 'Giữ tồn kho thất bại hoặc Inventory Service không phản hồi',
        HttpStatus.BAD_REQUEST,
      );
    }

    // --- BƯỚC 2: TẠO ĐƠN HÀNG VÀ LƯU DATABASE (STATUS: PENDING) ---
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let savedOrder: Order;

    try {
      const order = this.orderRepository.create({
        id: orderId,
        user_id: userId.toString(),
        branch_id: branchId.toString(),
        total_amount: totalAmount,
        status: OrderStatus.PENDING,
      });

      // Tạo các OrderItems
      order.items = items.map(item => this.orderItemRepository.create({
        product_id: item.productId.toString(),
        product_name_snapshot: item.productName,
        price_snapshot: item.price,
        quantity: item.quantity,
      }));

      savedOrder = await this.orderRepository.save(order);
      console.log(`[OrderService] Đã lưu đơn hàng PENDING vào Database: ${savedOrder.id}`);
    } catch (dbError) {
      // SAGA PATTERN: BƯỚC 2 BỊ LỖI -> GỌI SAGA BÙ TRỪ GIẢI PHÓNG KHO (RELEASE STOCK)
      console.error(`[OrderService] Lưu DB thất bại, đang rollback release-stock...`);
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/release-stock`, {
          branchId: branchId.toString(),
          referenceId: orderId,
          items: items.map(i => ({ productId: i.productId.toString(), quantity: i.quantity })),
        });
      } catch (rollbackError) {
        console.error(`[CRITICAL] Rollback tồn kho thất bại! Cần can thiệp thủ công.`, rollbackError);
      }
      throw new HttpException('Lỗi hệ thống khi tạo đơn hàng. Đã hoàn lại tồn kho.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // --- BƯỚC 3: GỌI THANH TOÁN (PAYMENT SERVICE) NẾU LÀ CỔNG ONLINE ---
    let paymentUrl = '';
    if (paymentMethod === 'MOMO' || paymentMethod === 'ZALOPAY' || paymentMethod === 'ATM') {
      try {
        const paymentRes = await axios.post(`${PAYMENT_SERVICE_URL}/payments/create`, {
          orderId: savedOrder.id,
          amount: totalAmount,
          method: paymentMethod
        });
        paymentUrl = paymentRes.data.paymentUrl;
      } catch (paymentErr) {
        console.error(`[OrderService] Lấy link thanh toán thất bại`, paymentErr);
      }
    }

    // --- BƯỚC 4: BẮN EVENT NOTIFICATION ---
    axios.post(`${NOTIFICATION_SERVICE_URL}/notifications/events`, {
      event: 'order_created',
      payload: {
        orderId: savedOrder.id,
        userId: userId,
        totalAmount: totalAmount,
        status: savedOrder.status
      }
    }).catch(e => console.error('[OrderService] Không gửi được event qua MQ giả lập (Notification)'));

    // --- HOÀN TẤT ---
    return {
      success: true,
      message: 'Đặt hàng thành công!',
      orderId: savedOrder.id,
      paymentUrl: paymentUrl,
      status: savedOrder.status,
    };
  }

  // --- CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (SAGA CONFIRM HOẶC CANCEL) ---
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    }

    const oldStatus = order.status;
    const newStatus = body.status;

    if (oldStatus === newStatus) {
      return order;
    }

    // Khi chuyển sang CONFIRMED hoặc PAID: Xác nhận trừ kho vĩnh viễn (confirm-deduct)
    if (oldStatus === OrderStatus.PENDING && (newStatus === OrderStatus.CONFIRMED || newStatus === OrderStatus.PAID)) {
      try {
        console.log(`[OrderService] Đơn hàng ${order.id} được xác nhận, gọi confirm-deduct...`);
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/confirm-deduct`, {
          branchId: order.branch_id,
          referenceId: order.id,
          items: order.items.map(item => ({
            productId: item.product_id,
            quantity: item.quantity,
          })),
        });
      } catch (err: any) {
        throw new HttpException(
          err.response?.data?.message || 'Không thể xác nhận trừ kho tại Inventory Service',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Khi huỷ đơn hàng đang PENDING: Hoàn trả số lượng đã giữ (release-stock)
    if (oldStatus === OrderStatus.PENDING && newStatus === OrderStatus.CANCELLED) {
      try {
        console.log(`[OrderService] Đơn hàng ${order.id} bị huỷ, gọi release-stock...`);
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/release-stock`, {
          branchId: order.branch_id,
          referenceId: order.id,
          items: order.items.map(item => ({
            productId: item.product_id,
            quantity: item.quantity,
          })),
        });
      } catch (err: any) {
        console.error(`[OrderService] Giải phóng kho thất bại khi huỷ đơn ${order.id}:`, err);
      }
    }

    order.status = newStatus;
    return await this.orderRepository.save(order);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllOrders(@Req() req: any) {
    const user = req.user;
    // Phân quyền dữ liệu theo vai trò nếu có
    if (user?.role === 'CUSTOMER') {
      return await this.orderRepository.find({
        where: { user_id: user.id || user.sub },
        relations: ['items'],
        order: { created_at: 'DESC' },
      });
    }
    if (user?.role === 'BRANCH_MANAGER' && user?.branch_id) {
      return await this.orderRepository.find({
        where: { branch_id: user.branch_id },
        relations: ['items'],
        order: { created_at: 'DESC' },
      });
    }
    return await this.orderRepository.find({
      relations: ['items'],
      order: { created_at: 'DESC' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const found = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!found) throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return found;
  }
}

