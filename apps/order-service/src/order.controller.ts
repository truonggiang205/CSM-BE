import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';

interface CreateOrderDto {
  userId: number;
  branchId: number;
  items: Array<{ productId: number; quantity: number; price: number; productName: string }>;
  shippingAddress: string;
}

const ORDERS_DB: any[] = [];

@Controller('orders')
export class OrderController {
  @Post()
  async createOrder(@Body() dto: CreateOrderDto) {
    const { branchId, items, userId, shippingAddress } = dto;

    if (!items || items.length === 0) {
      throw new HttpException('Đơn hàng phải có ít nhất 1 sản phẩm', HttpStatus.BAD_REQUEST);
    }

    // 1. Giao tiếp liên service (Inter-Service Communication):
    // Order Service gọi sang Inventory Service để kiểm tra và trừ kho
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

    // 2. Tính tổng tiền và lưu đơn hàng vào db_order
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const orderCode = 'ORD-' + Date.now().toString().slice(-6);

    const newOrder = {
      id: ORDERS_DB.length + 1,
      orderCode,
      userId,
      branchId,
      items,
      totalAmount,
      shippingAddress,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    ORDERS_DB.push(newOrder);

    return {
      success: true,
      message: 'Đặt hàng thành công và đã trừ tồn kho tương ứng!',
      order: newOrder,
    };
  }

  @Get()
  getAllOrders() {
    return ORDERS_DB;
  }

  @Get(':id')
  getOrderById(@Param('id') id: string) {
    const found = ORDERS_DB.find(o => o.id === Number(id));
    if (!found) throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return found;
  }
}
