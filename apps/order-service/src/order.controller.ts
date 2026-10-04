import { Controller, Get, Post, Patch, Body, Param, HttpException, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006';

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

    // --- BƯỚC 0.1: XÁC THỰC CHI NHÁNH TỒN TẠI (INVENTORY SERVICE) ---
    try {
      const bRes = await axios.get(`${INVENTORY_SERVICE_URL}/branches/${branchId}`);
      if (!bRes.data || !bRes.data.id) {
        throw new Error('Branch not found');
      }
    } catch {
      throw new HttpException(
        `Chi nhánh với ID '${branchId}' không tồn tại trong hệ thống`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // --- BƯỚC 0.2: XÁC THỰC GIÁ VÀ TÊN TỪ PRODUCT SERVICE (KHÔNG TIN GIÁ/TÊN BODY GỬI LÊN) ---
    const verifiedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const pRes = await axios.get(`${PRODUCT_SERVICE_URL}/products/${item.productId}`);
          const product = pRes.data;
          if (!product || !product.id) {
            throw new Error('Not found');
          }
          const price = Number(product.base_price) || 0;
          return {
            productId: product.id.toString(),
            productName: product.name,
            price: price,
            quantity: Number(item.quantity) || 1,
          };
        } catch {
          throw new HttpException(
            `Sản phẩm ID ${item.productId} không tồn tại trong hệ thống`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }),
    );

    // --- BƯỚC 1: SAGA - GIỮ HÀNG TỒN KHO TẠM THỜI (RESERVE STOCK) ---
    try {
      console.log(`[OrderService] Gọi Inventory Service (${INVENTORY_SERVICE_URL}) để giữ kho (reserve-stock)...`);
      const reserveRes = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/reserve-stock`, {
        branchId: branchId.toString(),
        referenceId: orderId,
        items: verifiedItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
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

    // --- BƯỚC 2: TẠO ĐƠN HÀNG VÀ LƯU DATABASE (STATUS: PENDING, GIÁ CHUẨN TỪ SERVER) ---
    const totalAmount = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let savedOrder: Order;

    try {
      const order = this.orderRepository.create({
        id: orderId,
        user_id: userId.toString(),
        branch_id: branchId.toString(),
        total_amount: totalAmount,
        status: OrderStatus.PENDING,
      });

      // Tạo các OrderItems từ thông tin đã được server xác thực
      order.items = verifiedItems.map(item => this.orderItemRepository.create({
        product_id: item.productId,
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
          items: verifiedItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
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
  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @Req() req: any,
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

    // 1. Kiểm tra quyền hạn người dùng trước (CUSTOMER chỉ được huỷ PENDING đơn của mình)
    const internalSecret = process.env.INTERNAL_SECRET;
    const isInternalCall = Boolean(internalSecret && req.headers['x-internal-secret'] === internalSecret);

    if (!isInternalCall) {
      const user = req.user;
      const userRole = user?.role;
      const userId = user?.id || user?.sub;
      const userBranchId = user?.branch_id;

      if (!userRole) {
        throw new HttpException('Không xác định được danh tính người dùng', HttpStatus.UNAUTHORIZED);
      }

      // Khách hàng (CUSTOMER): CHỈ được phép chuyển PENDING -> CANCELLED cho đơn hàng của chính mình
      if (userRole === 'CUSTOMER') {
        if (order.user_id !== userId) {
          throw new HttpException('Bạn không có quyền can thiệp vào đơn hàng của người khác', HttpStatus.FORBIDDEN);
        }
        if (newStatus !== OrderStatus.CANCELLED) {
          throw new HttpException('Khách hàng không có quyền chuyển sang trạng thái này', HttpStatus.FORBIDDEN);
        }
        if (oldStatus !== OrderStatus.PENDING) {
          throw new HttpException(
            'Khách hàng chỉ có quyền huỷ đơn hàng khi đơn còn ở trạng thái PENDING',
            HttpStatus.FORBIDDEN,
          );
        }
      } else if (userRole === 'BRANCH_MANAGER') {
        // Quản lý chi nhánh chỉ được thao tác trên đơn hàng thuộc chi nhánh mình phụ trách
        if (userBranchId && order.branch_id.toString() !== userBranchId.toString()) {
          throw new HttpException(
            'Quản lý chi nhánh chỉ được cập nhật đơn hàng thuộc chi nhánh của mình',
            HttpStatus.FORBIDDEN,
          );
        }
      } else if (userRole !== 'ADMIN' && userRole !== 'STAFF') {
        throw new HttpException('Bạn không có quyền thực hiện thao tác này', HttpStatus.FORBIDDEN);
      }
    }

    // 2. Kiểm tra bảng chuyển trạng thái hợp lệ
    const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

    const allowedNextStatuses = VALID_TRANSITIONS[oldStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new HttpException(
        `Chuyển trạng thái không hợp lệ: Không thể chuyển từ ${oldStatus} sang ${newStatus}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Thực thi Saga tương ứng với điều kiện nghiêm ngặt
    // Chỉ confirm-deduct khi chuyển từ PENDING sang CONFIRMED hoặc PAID (chỉ làm 1 lần duy nhất)
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

    // Chỉ release-stock khi huỷ đơn hàng ĐANG PENDING (chưa confirm-deduct kho)
    if (oldStatus === OrderStatus.PENDING && newStatus === OrderStatus.CANCELLED) {
      try {
        console.log(`[OrderService] Đơn hàng ${order.id} huỷ khi đang PENDING, gọi release-stock...`);
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

  @Get('branch/:branchId/active-count')
  async getActiveOrdersCount(@Param('branchId') branchId: string) {
    const count = await this.orderRepository.count({
      where: [
        { branch_id: branchId, status: OrderStatus.PENDING },
        { branch_id: branchId, status: OrderStatus.CONFIRMED },
      ],
    });
    return { branchId, count };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const found = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!found) throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return found;
  }
}

