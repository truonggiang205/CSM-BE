import { Controller, Get, Post, Body, Param, HttpException, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006';

interface CreateOrderDto {
  branchId: number;
  items: Array<{ productId: number; quantity: number; price: number; productName: string }>;
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
    const userId = req.user.id; // Lấy từ JWT sau khi qua AuthGuard

    if (!items || items.length === 0) {
      throw new HttpException('Đơn hàng phải có ít nhất 1 sản phẩm', HttpStatus.BAD_REQUEST);
    }

    // --- BƯỚC 1: TRỪ TỒN KHO (INVENTORY SERVICE) ---
    try {
      console.log(`[OrderService] Đang gọi sang Inventory Service (${INVENTORY_SERVICE_URL}) để trừ kho...`);
      const deductRes = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/deduct-stock`, {
        branchId,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });

      if (!deductRes.data.success) {
        throw new HttpException('Không thể trừ tồn kho', HttpStatus.BAD_REQUEST);
      }
    } catch (err: any) {
      throw new HttpException(
        err.response?.data?.message || 'Trừ kho thất bại hoặc Inventory Service không phản hồi',
        HttpStatus.BAD_REQUEST,
      );
    }

    // --- BƯỚC 2: TẠO ĐƠN HÀNG & LƯU DB (ORDER SERVICE) ---
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let savedOrder: Order;

    try {
      const order = this.orderRepository.create({
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
      console.log(`[OrderService] Đã lưu đơn hàng vào Database: ${savedOrder.id}`);
    } catch (dbError) {
      // SAGA PATTERN: BƯỚC 2 BỊ LỖI -> GỌI ROLLBACK TRẢ LẠI KHO (INVENTORY SERVICE)
      console.error(`[OrderService] Lưu DB thất bại, đang rollback tồn kho...`);
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/refund-stock`, {
          branchId,
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        });
      } catch (rollbackError) {
        console.error(`[CRITICAL] Rollback tồn kho thất bại! Cần can thiệp thủ công.`, rollbackError);
      }
      throw new HttpException('Lỗi hệ thống khi tạo đơn hàng. Đã hoàn lại tồn kho.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // --- BƯỚC 3: GỌI THANH TOÁN (PAYMENT SERVICE) ---
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

    // --- BƯỚC 4: BẮN EVENT MESSAGE QUEUE ĐỂ THÔNG BÁO (NOTIFICATION SERVICE) ---
    // (Mô phỏng Message Broker bằng HTTP call không đồng bộ để khỏi block request)
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
      paymentUrl: paymentUrl, // Trả về cho FE redirect
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllOrders() {
    return await this.orderRepository.find({ relations: ['items'] });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const found = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!found) throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return found;
  }
}
