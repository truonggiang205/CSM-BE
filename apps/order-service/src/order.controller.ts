import { Controller, Get, Post, Patch, Body, Param, Query, HttpException, HttpStatus, UseGuards, Req, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { requireEnv } from '@csm/config';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderReview } from './entities/order-review.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { QueryOrderDto, QueryMyOrderDto } from './dto/query-order.dto';

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006';
const DISCOUNT_SERVICE_URL = process.env.DISCOUNT_SERVICE_URL || 'http://localhost:3007';

@Controller('orders')
export class OrderController {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @Optional()
    @InjectRepository(OrderReview)
    private readonly orderReviewRepository?: Repository<OrderReview>,
  ) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'order-service' };
  }

  @UseGuards(JwtAuthGuard)

  @Post()
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const { branchId, items = [], combos = [], shippingAddress, paymentMethod, voucherCode } = dto;
    const userId = req.user?.id || req.headers['x-user-id'] || 'anonymous';
    const orderId = randomUUID();

    if ((!items || items.length === 0) && (!combos || combos.length === 0)) {
      throw new HttpException('Đơn hàng phải có ít nhất 1 sản phẩm hoặc combo', HttpStatus.BAD_REQUEST);
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

    const activeFlashSaleMap = new Map<string, { salePrice: number; maxPerUser: number }>();
    try {
      const fsRes = await axios.get(`${DISCOUNT_SERVICE_URL}/flash-sales/current`, { timeout: 3000 });
      if (fsRes.data && fsRes.data.status === 'ACTIVE' && Array.isArray(fsRes.data.items)) {
        for (const fsItem of fsRes.data.items) {
          if (fsItem.product_id && Number(fsItem.sale_price) > 0) {
            activeFlashSaleMap.set(String(fsItem.product_id), {
              salePrice: Number(fsItem.sale_price),
              maxPerUser: Number(fsItem.max_per_user) || 2,
            });
          }
        }
      }
    } catch {}

    const verifiedRegularItems = await Promise.all(
      (items || []).map(async (item) => {
        let product: any;
        try {
          const pRes = await axios.get(`${PRODUCT_SERVICE_URL}/products/${item.productId}`);
          product = pRes.data;
          if (!product || !product.id) {
            throw new Error('Not found');
          }
        } catch {
          throw new HttpException(
            `Sản phẩm ID ${item.productId} không tồn tại trong hệ thống`,
            HttpStatus.NOT_FOUND,
          );
        }

        const basePrice = Number(product.base_price) || 0;
        const flashSaleInfo = activeFlashSaleMap.get(product.id.toString());
        const qty = Number(item.quantity) || 1;
        let price = basePrice;

        if (flashSaleInfo && flashSaleInfo.salePrice > 0 && flashSaleInfo.salePrice < basePrice) {
          if (userId && userId !== 'anonymous') {
            let boughtToday = 0;
            try {
              const startOfDay = new Date();
              startOfDay.setHours(0, 0, 0, 0);
              const rawSum = await this.orderItemRepository
                .createQueryBuilder('oi')
                .innerJoin('oi.order', 'o')
                .select('COALESCE(SUM(oi.quantity), 0)', 'total')
                .where('o.user_id = :userId', { userId: userId.toString() })
                .andWhere('o.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
                .andWhere('o.created_at >= :startOfDay', { startOfDay })
                .andWhere('oi.product_id = :productId', { productId: product.id.toString() })
                .andWhere("(oi.item_type IS NULL OR oi.item_type = 'PRODUCT')")
                .getRawOne();
              boughtToday = Number(rawSum?.total) || 0;
            } catch {
              boughtToday = 0;
            }

            if (boughtToday + qty > flashSaleInfo.maxPerUser) {
              throw new HttpException(
                `Mỗi khách hàng chỉ được mua tối đa ${flashSaleInfo.maxPerUser} suất Giờ Vàng hôm nay cho "${product.name}" (đã mua ${boughtToday}).`,
                HttpStatus.BAD_REQUEST,
              );
            }
          }
          price = flashSaleInfo.salePrice;
        }

        return {
          productId: product.id.toString(),
          productName: product.name,
          price: price,
          quantity: qty,
          itemType: 'PRODUCT' as const,
          comboId: null as string | null,
          comboItemsSnapshot: null as Array<{ productId: string; productName: string; quantity: number }> | null,
        };
      }),
    );

    const verifiedCombos = await Promise.all(
      (combos || []).map(async (comboReq) => {
        let comboData: any;
        try {
          const cRes = await axios.get(`${DISCOUNT_SERVICE_URL}/combos/${comboReq.comboId}`);
          comboData = cRes.data;
        } catch {
          throw new HttpException(
            `Combo ID ${comboReq.comboId} không tồn tại trong hệ thống`,
            HttpStatus.NOT_FOUND,
          );
        }

        if (!comboData || !comboData.is_active) {
          throw new HttpException(
            `Combo "${comboData?.name || comboReq.comboId}" hiện đang tạm ngưng`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const now = new Date();
        if (comboData.start_date && new Date(comboData.start_date) > now) {
          throw new HttpException(
            `Combo "${comboData.name}" chưa đến thời gian mở bán`,
            HttpStatus.BAD_REQUEST,
          );
        }
        if (comboData.end_date && new Date(comboData.end_date) < now) {
          throw new HttpException(
            `Combo "${comboData.name}" đã hết hạn áp dụng`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const comboQty = Math.max(1, Number(comboReq.quantity) || 1);
        if (
          comboData.max_quantity !== null &&
          comboData.max_quantity !== undefined &&
          Number(comboData.sold_count || 0) + comboQty > Number(comboData.max_quantity)
        ) {
          throw new HttpException(
            `Combo "${comboData.name}" không đủ suất ưu đãi còn lại`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const comboItemsSnapshot = Array.isArray(comboData.items)
          ? comboData.items.map((ci: any) => ({
              productId: String(ci.product_id),
              productName: ci.product_name || ci.product_id,
              quantity: Math.max(1, Number(ci.quantity) || 1),
            }))
          : [];

        return {
          productId: String(comboData.id),
          productName: comboData.name,
          price: Number(comboData.combo_price) || 0,
          quantity: comboQty,
          itemType: 'COMBO' as const,
          comboId: String(comboData.id),
          comboItemsSnapshot,
        };
      }),
    );

    const verifiedGiftItems: Array<{
      productId: string;
      productName: string;
      price: number;
      quantity: number;
      itemType: 'PRODUCT';
      comboId: null;
      comboItemsSnapshot: null;
    }> = [];
    try {
      const prelimSubtotal = [...verifiedRegularItems, ...verifiedCombos].reduce(
        (sum, i) => sum + i.price * i.quantity,
        0,
      );
      const giftRes = await axios.post(
        `${DISCOUNT_SERVICE_URL}/gift-promotions/evaluate`,
        {
          items: verifiedRegularItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          subtotal: prelimSubtotal,
        },
        { timeout: 3000 },
      );
      if (Array.isArray(giftRes.data)) {
        for (const gift of giftRes.data) {
          if (gift.productId && Number(gift.quantity) > 0) {
            verifiedGiftItems.push({
              productId: String(gift.productId),
              productName: `🎁 [Tặng kèm] ${gift.productName || gift.productId}`,
              price: 0,
              quantity: Number(gift.quantity),
              itemType: 'PRODUCT',
              comboId: null,
              comboItemsSnapshot: null,
            });
          }
        }
      }
    } catch {}

    const verifiedItems = [...verifiedRegularItems, ...verifiedCombos, ...verifiedGiftItems];

    // Tổng hợp số lượng từng sản phẩm thực tế cần trừ kho (từ sản phẩm lẻ + các món trong combo + quà tặng)
    const inventoryQtyMap = new Map<string, number>();
    for (const item of verifiedRegularItems) {
      inventoryQtyMap.set(item.productId, (inventoryQtyMap.get(item.productId) || 0) + item.quantity);
    }
    for (const gift of verifiedGiftItems) {
      inventoryQtyMap.set(gift.productId, (inventoryQtyMap.get(gift.productId) || 0) + gift.quantity);
    }
    for (const combo of verifiedCombos) {
      for (const ci of combo.comboItemsSnapshot || []) {
        const addQty = ci.quantity * combo.quantity;
        inventoryQtyMap.set(ci.productId, (inventoryQtyMap.get(ci.productId) || 0) + addQty);
      }
    }
    const aggregatedInventoryItems = Array.from(inventoryQtyMap.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    // --- BƯỚC 1: SAGA - GIỮ HÀNG TỒN KHO TẠM THỜI (RESERVE STOCK) ---
    try {
      console.log(`[OrderService] Gọi Inventory Service (${INVENTORY_SERVICE_URL}) để giữ kho (reserve-stock)...`);
      const reserveRes = await axios.post(`${INVENTORY_SERVICE_URL}/inventory/reserve-stock`, {
        branchId: branchId.toString(),
        referenceId: orderId,
        items: aggregatedInventoryItems,
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

    // --- BƯỚC 1.5: XÁC THỰC VOUCHER TỪ DISCOUNT SERVICE (NẾU CÓ TRUYỀN VOUCHER CODE) ---
    const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const shippingFee = subtotal >= 150000 ? 0 : 15000;
    let discountAmount = 0;
    let appliedVoucherCode: string | null = null;

    if (voucherCode && voucherCode.trim() !== '') {
      try {
        const discountRes = await axios.post(
          `${DISCOUNT_SERVICE_URL}/discounts/vouchers/validate`,
          {
            code: voucherCode.trim(),
            orderValue: subtotal,
            userId: userId.toString(),
            shippingFee: shippingFee,
          },
          { timeout: 5000 },
        );
        if (discountRes.data && (discountRes.data.valid || discountRes.data.isValid)) {
          discountAmount = Number(discountRes.data.discountAmount) || 0;
          appliedVoucherCode = voucherCode.trim().toUpperCase();
        }
      } catch (discErr: any) {
        // Rollback kho hàng an toàn nếu voucher không hợp lệ
        try {
          await axios.post(
            `${INVENTORY_SERVICE_URL}/inventory/release-stock`,
            {
              branchId: branchId.toString(),
              referenceId: orderId,
              items: aggregatedInventoryItems,
            },
            { timeout: 5000 },
          );
        } catch (releaseErr: any) {
          console.error('[OrderService] Lỗi giải phóng tồn kho khi voucher không hợp lệ:', releaseErr.message);
        }
        throw new HttpException(
          discErr.response?.data?.message || 'Mã giảm giá không hợp lệ hoặc đã hết hạn',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const totalAmount = Math.max(0, subtotal + shippingFee - discountAmount);

    // --- BƯỚC 2: TẠO ĐƠN HÀNG VÀ LƯU DATABASE (STATUS: PENDING, GIÁ CHUẨN TỪ SERVER) ---
    let savedOrder: Order;

    try {
      const isCod = !paymentMethod || paymentMethod.toUpperCase() === 'COD';
      const initialStatus = isCod ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

      const order = this.orderRepository.create({
        id: orderId,
        user_id: userId.toString(),
        branch_id: branchId.toString(),
        subtotal_amount: subtotal,
        discount_amount: discountAmount,
        voucher_code: appliedVoucherCode,
        total_amount: totalAmount,
        payment_method: paymentMethod || 'COD',
        status: initialStatus,
      });

      order.items = verifiedItems.map(item => this.orderItemRepository.create({
        product_id: item.productId,
        product_name_snapshot: item.productName,
        price_snapshot: item.price,
        quantity: item.quantity,
        item_type: item.itemType,
        combo_id: item.comboId,
        combo_items_snapshot: item.comboItemsSnapshot,
      }));

      savedOrder = await this.orderRepository.save(order);
      console.log(`[OrderService] Đã lưu đơn hàng (${initialStatus}) vào Database: ${savedOrder.id}`);

      if (initialStatus === OrderStatus.CONFIRMED) {
        try {
          await axios.post(`${INVENTORY_SERVICE_URL}/inventory/confirm-deduct`, {
            branchId: branchId.toString(),
            referenceId: savedOrder.id,
            items: aggregatedInventoryItems,
          });
        } catch (confirmErr: any) {
          console.error('[OrderService] Confirm deduct kho thất bại:', confirmErr?.message);
        }
      }

      if (appliedVoucherCode) {
        try {
          await axios.post(
            `${DISCOUNT_SERVICE_URL}/discounts/vouchers/claim`,
            {
              code: appliedVoucherCode,
              userId: userId.toString(),
              orderId: savedOrder.id,
            },
            {
              headers: {
                'x-internal-secret': requireEnv('INTERNAL_SECRET'),
              },
              timeout: 5000,
            },
          );
        } catch (claimErr: any) {
          console.error('[OrderService] Không cập nhật được used_count của voucher:', claimErr.response?.data || claimErr.message);
          // Rollback đơn hàng (xoá order_items trước để tránh lỗi khoá ngoại) & tồn kho nếu claim voucher thất bại
          try {
            await this.orderItemRepository
              .createQueryBuilder()
              .delete()
              .where('order_id = :orderId', { orderId: savedOrder.id })
              .execute();
            await this.orderRepository.delete(savedOrder.id);
          } catch (delErr: any) {
            console.error('[OrderService] Lỗi khi xoá đơn hàng rollback:', delErr.message);
          }

          try {
            await axios.post(
              `${INVENTORY_SERVICE_URL}/inventory/release-stock`,
              {
                branchId: branchId.toString(),
                referenceId: orderId,
                items: verifiedItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
              },
              { timeout: 5000 },
            );
          } catch {}

          // SAGA BÙ TRỪ: Nếu claim thất bại hoặc timeout quá 5s nhưng discount-service đã trừ lượt,
          // luôn gọi idempotent release để hoàn lại lượt sử dụng, bảo đảm user không bị mất voucher
          try {
            await axios.post(
              `${DISCOUNT_SERVICE_URL}/discounts/vouchers/release`,
              {
                code: appliedVoucherCode,
                userId: userId.toString(),
                orderId: savedOrder.id,
              },
              {
                headers: {
                  'x-internal-secret': requireEnv('INTERNAL_SECRET'),
                },
                timeout: 5000,
              },
            );
          } catch (relErr: any) {
            console.error('[OrderService] Lỗi giải phóng voucher trong rollback:', relErr.message);
          }

          throw new HttpException(
            claimErr.response?.data?.message || 'Voucher đã hết lượt sử dụng hoặc timeout trong lúc đặt hàng',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (verifiedRegularItems.length > 0) {
        axios.post(`${DISCOUNT_SERVICE_URL}/flash-sales/record-purchase`, {
          items: verifiedRegularItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }).catch((e) => console.error('[OrderService] Ghi nhận lượt mua flash sale thất bại:', e?.message));
      }

      if (verifiedCombos.length > 0) {
        axios.post(`${DISCOUNT_SERVICE_URL}/combos/record-purchase`, {
          combos: verifiedCombos.map((c) => ({ comboId: c.comboId, quantity: c.quantity })),
        }).catch((e) => console.error('[OrderService] Ghi nhận lượt mua combo thất bại:', e?.message));
      }
    } catch (dbError) {
      if (dbError instanceof HttpException) {
        throw dbError;
      }
      // SAGA PATTERN: BƯỚC 2 BỊ LỖI -> GỌI SAGA BÙ TRỪ GIẢI PHÓNG KHO (RELEASE STOCK) VÀ VOUCHER
      console.error(`[OrderService] Lưu DB thất bại, đang rollback release-stock...`);
      try {
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/release-stock`, {
          branchId: branchId.toString(),
          referenceId: orderId,
          items: aggregatedInventoryItems,
        });
      } catch (rollbackError) {
        console.error(`[CRITICAL] Rollback tồn kho thất bại! Cần can thiệp thủ công.`, rollbackError);
      }
      if (appliedVoucherCode && savedOrder?.id) {
        try {
          await axios.post(
            `${DISCOUNT_SERVICE_URL}/discounts/vouchers/release`,
            {
              code: appliedVoucherCode,
              userId: userId.toString(),
              orderId: savedOrder.id,
            },
            {
              headers: {
                'x-internal-secret': requireEnv('INTERNAL_SECRET'),
              },
              timeout: 5000,
            },
          );
        } catch {}
      }
      throw new HttpException('Lỗi hệ thống khi tạo đơn hàng. Đã hoàn lại tồn kho.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // --- BƯỚC 3: GỌI THANH TOÁN (PAYMENT SERVICE) NẾU LÀ CỔNG ONLINE ---
    let paymentUrl = '';
    if (paymentMethod === 'MOMO' || paymentMethod === 'ZALOPAY' || paymentMethod === 'ATM') {
      try {
        const paymentRes = await axios.post(
          `${PAYMENT_SERVICE_URL}/payments/create`,
          {
            orderId: savedOrder.id,
            amount: totalAmount,
            method: paymentMethod,
          },
          {
            headers: {
              'x-internal-secret': requireEnv('INTERNAL_SECRET'),
            },
          },
        );
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
        if (oldStatus !== OrderStatus.PENDING && oldStatus !== OrderStatus.CONFIRMED) {
          throw new HttpException(
            'Khách hàng chỉ có quyền huỷ đơn hàng khi đơn chưa được giao',
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
      [OrderStatus.SHIPPED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    const allowedNextStatuses = VALID_TRANSITIONS[oldStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new HttpException(
        `Chuyển trạng thái không hợp lệ: Không thể chuyển từ ${oldStatus} sang ${newStatus}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const aggregateInventoryItems = (orderItems: OrderItem[]) => {
      const qtyMap = new Map<string, number>();
      for (const item of orderItems || []) {
        if (item.item_type === 'COMBO' && Array.isArray(item.combo_items_snapshot)) {
          for (const ci of item.combo_items_snapshot) {
            const addQty = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            qtyMap.set(ci.productId, (qtyMap.get(ci.productId) || 0) + addQty);
          }
        } else {
          qtyMap.set(item.product_id, (qtyMap.get(item.product_id) || 0) + (Number(item.quantity) || 1));
        }
      }
      return Array.from(qtyMap.entries()).map(([productId, quantity]) => ({ productId, quantity }));
    };

    const inventoryItemsForOrder = aggregateInventoryItems(order.items);

    // 3. Thực thi Saga tương ứng với điều kiện nghiêm ngặt
    // Chỉ confirm-deduct khi chuyển từ PENDING sang CONFIRMED hoặc PAID (chỉ làm 1 lần duy nhất)
    if (oldStatus === OrderStatus.PENDING && (newStatus === OrderStatus.CONFIRMED || newStatus === OrderStatus.PAID)) {
      try {
        console.log(`[OrderService] Đơn hàng ${order.id} được xác nhận, gọi confirm-deduct...`);
        await axios.post(`${INVENTORY_SERVICE_URL}/inventory/confirm-deduct`, {
          branchId: order.branch_id,
          referenceId: order.id,
          items: inventoryItemsForOrder,
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
          items: inventoryItemsForOrder,
        });
      } catch (err: any) {
        console.error(`[OrderService] Giải phóng kho thất bại khi huỷ đơn ${order.id}:`, err);
      }
    }

    // SAGA ROLLBACK: Hoàn lại lượt sử dụng voucher nếu đơn hàng bị huỷ
    if (newStatus === OrderStatus.CANCELLED) {
      if (order.voucher_code) {
        try {
          console.log(`[OrderService] Đơn hàng ${order.id} bị huỷ, gọi release voucher ${order.voucher_code}...`);
          await axios.post(
            `${DISCOUNT_SERVICE_URL}/discounts/vouchers/release`,
            {
              code: order.voucher_code,
              userId: order.user_id,
              orderId: order.id,
            },
            {
              headers: {
                'x-internal-secret': requireEnv('INTERNAL_SECRET'),
              },
              timeout: 5000,
            },
          );
        } catch (err: any) {
          console.error(`[OrderService] Hoàn voucher thất bại khi huỷ đơn ${order.id}:`, err?.message || err);
        }
      }

      const regularOrderItems = (order.items || []).filter((item) => item.item_type !== 'COMBO');
      if (regularOrderItems.length > 0) {
        axios.post(`${DISCOUNT_SERVICE_URL}/flash-sales/rollback-purchase`, {
          items: regularOrderItems.map((item) => ({
            productId: item.product_id,
            quantity: item.quantity,
          })),
        }).catch((e) => console.error('[OrderService] Hoàn lại lượt mua flash sale thất bại:', e?.message));
      }

      const comboOrderItems = (order.items || []).filter((item) => item.item_type === 'COMBO' && item.combo_id);
      if (comboOrderItems.length > 0) {
        axios.post(`${DISCOUNT_SERVICE_URL}/combos/rollback-purchase`, {
          combos: comboOrderItems.map((item) => ({
            comboId: item.combo_id,
            quantity: item.quantity,
          })),
        }).catch((e) => console.error('[OrderService] Hoàn lại lượt mua combo thất bại:', e?.message));
      }
    }

    order.status = newStatus;
    return await this.orderRepository.save(order);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMyOrders(@Req() req: any, @Query() query: QueryMyOrderDto) {
    const userId = req.user?.id || req.user?.sub || req.headers['x-user-id'];
    if (!userId) {
      throw new HttpException('Không xác định được danh tính người dùng', HttpStatus.UNAUTHORIZED);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = { user_id: userId.toString() };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await this.orderRepository.findAndCount({
      where,
      relations: ['items'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllOrders(@Req() req: any, @Query() query: QueryOrderDto) {
    const internalSecret = process.env.INTERNAL_SECRET;
    const isInternalCall = Boolean(internalSecret && req.headers['x-internal-secret'] === internalSecret);

    const user = req.user;
    const userRole = isInternalCall ? 'ADMIN' : user?.role;
    const userBranchId = user?.branch_id;

    if (userRole === 'CUSTOMER') {
      throw new HttpException('Khách hàng không có quyền truy cập danh sách đơn hàng quản trị', HttpStatus.FORBIDDEN);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items');

    // Phân quyền chi nhánh
    if (userRole === 'BRANCH_MANAGER' || userRole === 'STAFF') {
      if (!userBranchId) {
        throw new HttpException('Nhân viên chưa được phân công chi nhánh quản lý', HttpStatus.FORBIDDEN);
      }
      // Luôn ép theo chi nhánh của mình, bỏ qua branchId client gửi
      qb.andWhere('order.branch_id = :userBranch', { userBranch: userBranchId.toString() });
    } else if (userRole === 'ADMIN' || userRole === 'SYSTEM') {
      // ADMIN xem được tất cả, nếu có lọc theo branchId thì áp dụng
      if (query.branchId) {
        qb.andWhere('order.branch_id = :filterBranch', { filterBranch: query.branchId.toString() });
      }
    } else {
      throw new HttpException('Bạn không có quyền truy cập danh sách đơn hàng', HttpStatus.FORBIDDEN);
    }

    // Lọc theo trạng thái
    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    // Tìm kiếm theo ID đơn hàng
    if (query.search && query.search.trim()) {
      qb.andWhere('order.id LIKE :search', { search: `%${query.search.trim()}%` });
    }

    // Lọc theo khoảng ngày tạo đơn
    if (query.fromDate) {
      const fromTimestamp = Date.parse(query.fromDate);
      if (isNaN(fromTimestamp)) {
        throw new HttpException('Khoảng ngày không hợp lệ: fromDate sai định dạng', HttpStatus.BAD_REQUEST);
      }
    }
    if (query.toDate) {
      const toTimestamp = Date.parse(query.toDate);
      if (isNaN(toTimestamp)) {
        throw new HttpException('Khoảng ngày không hợp lệ: toDate sai định dạng', HttpStatus.BAD_REQUEST);
      }
    }
    if (query.fromDate && query.toDate) {
      if (new Date(query.fromDate) > new Date(query.toDate)) {
        throw new HttpException('Khoảng ngày không hợp lệ: fromDate phải trước hoặc bằng toDate', HttpStatus.BAD_REQUEST);
      }
    }
    if (query.fromDate) {
      qb.andWhere('order.created_at >= :fromDate', { fromDate: new Date(query.fromDate) });
    }
    if (query.toDate) {
      qb.andWhere('order.created_at <= :toDate', { toDate: new Date(query.toDate) });
    }

    qb.orderBy('order.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
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

  @Get('reviews/public')
  async getPublicReviews() {
    if (!this.orderReviewRepository) return [];
    return this.orderReviewRepository.find({
      order: { created_at: 'DESC' },
      take: 6,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/review')
  async getOrderReview(@Param('id') id: string) {
    if (!this.orderReviewRepository) return null;
    return this.orderReviewRepository.findOne({ where: { order_id: id } });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/review')
  async createOrderReview(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { rating: number; comment: string; customerName?: string },
  ) {
    if (!this.orderReviewRepository) {
      throw new HttpException('Chức năng đánh giá chưa sẵn sàng', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const order = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!order) {
      throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    }
    const userId = req.user?.id || req.user?.sub || req.headers['x-user-id'];
    if (order.user_id !== String(userId)) {
      throw new HttpException('Bạn không có quyền đánh giá đơn hàng này', HttpStatus.FORBIDDEN);
    }
    if (order.status !== OrderStatus.SHIPPED && order.status !== OrderStatus.PAID) {
      throw new HttpException('Chỉ có thể đánh giá đơn hàng đã thanh toán hoặc đã giao', HttpStatus.BAD_REQUEST);
    }
    const existing = await this.orderReviewRepository.findOne({ where: { order_id: id } });
    if (existing) {
      throw new HttpException('Đơn hàng này đã được đánh giá', HttpStatus.CONFLICT);
    }

    const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
    const comment = (body.comment || '').trim();
    if (!comment) {
      throw new HttpException('Vui lòng nhập nội dung đánh giá', HttpStatus.BAD_REQUEST);
    }

    const firstItemName = order.items?.[0]?.product_name_snapshot || 'Đơn hàng CSM';
    const review = this.orderReviewRepository.create({
      order_id: id,
      user_id: String(userId),
      customer_name: body.customerName?.trim() || req.user?.email?.split('@')[0] || 'Khách hàng CSM',
      rating,
      comment,
      purchased_item: firstItemName,
    });
    return this.orderReviewRepository.save(review);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOrderById(@Param('id') id: string, @Req() req: any) {
    const found = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!found) throw new HttpException('Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);

    const internalSecret = process.env.INTERNAL_SECRET;
    const isInternalCall = Boolean(internalSecret && req.headers['x-internal-secret'] === internalSecret);

    if (!isInternalCall) {
      const user = req.user;
      const userRole = user?.role;
      const userId = user?.id || user?.sub;
      const userBranchId = user?.branch_id;

      if (userRole === 'CUSTOMER') {
        if (found.user_id !== userId) {
          throw new HttpException('Bạn không có quyền xem đơn hàng của người khác', HttpStatus.FORBIDDEN);
        }
      } else if (userRole === 'BRANCH_MANAGER' || userRole === 'STAFF') {
        if (userBranchId && found.branch_id.toString() !== userBranchId.toString()) {
          throw new HttpException('Nhân viên chỉ được xem đơn hàng thuộc chi nhánh của mình', HttpStatus.FORBIDDEN);
        }
      } else if (userRole !== 'ADMIN' && userRole !== 'SYSTEM') {
        throw new HttpException('Bạn không có quyền xem đơn hàng này', HttpStatus.FORBIDDEN);
      }
    }

    return found;
  }
}

