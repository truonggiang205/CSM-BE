import { Injectable, OnModuleInit, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { VoucherUsage, UsageStatus } from './entities/voucher-usage.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Injectable()
export class DiscountService implements OnModuleInit {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherUsage)
    private readonly usageRepo: Repository<VoucherUsage>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.voucherRepo.count();
      if (count === 0) {
        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);

        await this.voucherRepo.save([
          {
            code: 'CSM20K',
            description: 'Giảm 20.000đ cho đơn hàng từ 100.000đ',
            discount_type: DiscountType.FIXED_AMOUNT,
            discount_value: 20000,
            min_order_value: 100000,
            usage_limit: 1000,
            max_usage_per_user: 1,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
          {
            code: 'CSM10PCT',
            description: 'Giảm 10% (tối đa 50.000đ) cho đơn hàng từ 150.000đ',
            discount_type: DiscountType.PERCENTAGE,
            discount_value: 10,
            max_discount_amount: 50000,
            min_order_value: 150000,
            usage_limit: 500,
            max_usage_per_user: 1,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
          {
            code: 'CSMFREESHIP',
            description: 'Hỗ trợ 15.000đ phí vận chuyển cho đơn từ 50.000đ',
            discount_type: DiscountType.FIXED_AMOUNT,
            discount_value: 15000,
            min_order_value: 50000,
            usage_limit: 2000,
            max_usage_per_user: 1,
            is_freeship: true,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
        ]);
        console.log('🎉 Đã khởi tạo dữ liệu mẫu 3 Voucher CSM thành công!');
      }
    } catch (err: any) {
      console.warn('⚠️ Seed voucher ban đầu bỏ qua:', err?.message || err);
    }
  }

  // Lấy danh sách voucher công khai còn hiệu lực (tự động loại bỏ mã mà người dùng đã dùng hết lượt)
  async getPublicVouchers(userId?: string) {
    const now = new Date();
    const vouchers = await this.voucherRepo.find({
      where: {
        is_active: true,
        start_date: LessThanOrEqual(now),
        end_date: MoreThanOrEqual(now),
      },
      order: { created_at: 'DESC' },
    });

    // Lọc theo tổng lượt dùng toàn hệ thống
    const availableVouchers = vouchers.filter(
      (v) => !v.usage_limit || v.used_count < v.usage_limit,
    );

    // Nếu có userId, kiểm tra và loại bỏ các mã mà user này đã dùng hết số lượt cho phép
    if (userId && userId.trim() !== '' && userId !== 'anonymous') {
      const userUsages = await this.usageRepo.find({
        where: {
          user_id: userId.trim(),
          status: UsageStatus.USED,
        },
        select: ['voucher_id'],
      });

      const usageCountMap = new Map<string, number>();
      for (const u of userUsages) {
        usageCountMap.set(u.voucher_id, (usageCountMap.get(u.voucher_id) || 0) + 1);
      }

      return availableVouchers.filter((v) => {
        const usedByUser = usageCountMap.get(v.id) || 0;
        const maxPerUser = v.max_usage_per_user || 1;
        return usedByUser < maxPerUser;
      });
    }

    return availableVouchers;
  }

  // Lấy toàn bộ danh sách voucher (dành cho Admin)
  async getAllVouchers() {
    return this.voucherRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  // Lấy danh sách lịch sử sử dụng voucher
  async getVoucherUsages(voucherId: string) {
    return this.usageRepo.find({
      where: { voucher_id: voucherId },
      order: { created_at: 'DESC' },
    });
  }

  // Thuật toán kiểm tra tính hợp lệ, giới hạn từng user, điều kiện phí ship và tính số tiền giảm
  async validateVoucher(code: string, orderValue: number, userId?: string, shippingFee?: number) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });

    if (!voucher) {
      throw new NotFoundException(`Mã giảm giá '${normalizedCode}' không tồn tại.`);
    }

    if (!voucher.is_active) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' hiện đang tạm dừng áp dụng.`);
    }

    const now = new Date();
    if (now < new Date(voucher.start_date)) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' chưa đến thời gian áp dụng.`);
    }

    if (now > new Date(voucher.end_date)) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết hạn sử dụng.`);
    }

    if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết lượt sử dụng trên hệ thống.`);
    }

    if (orderValue < Number(voucher.min_order_value)) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${Number(voucher.min_order_value).toLocaleString('vi-VN')}đ để dùng mã này.`,
      );
    }

    // KIỂM TRA ĐIỀU KIỆN MÃ FREESHIP: CHỈ ÁP DỤNG KHI ĐƠN HÀNG CÓ PHÍ VẬN CHUYỂN
    const isFreeshipVoucher =
      voucher.is_freeship ||
      voucher.code.toUpperCase().includes('FREESHIP') ||
      voucher.code.toUpperCase().includes('SHIP') ||
      (voucher.description && voucher.description.toLowerCase().includes('vận chuyển'));

    if (isFreeshipVoucher) {
      // Xác định phí vận chuyển thực tế: nếu client truyền thì dùng, nếu không truyền dựa vào ngưỡng freeship tự động (150.000đ)
      const effectiveShippingFee =
        shippingFee !== undefined
          ? Number(shippingFee)
          : (orderValue >= 150000 ? 0 : 15000);

      if (effectiveShippingFee <= 0) {
        throw new BadRequestException(
          'Mã freeship chỉ áp dụng cho đơn hàng có phí vận chuyển. Đơn hàng hiện tại của bạn đã được miễn phí vận chuyển.',
        );
      }
    }

    // KIỂM TRA GIỚI HẠN DÙNG CỦA TỪNG TÀI KHOẢN (MỖI USER CHỈ ĐƯỢC DÙNG N LẦN)
    if (userId && userId.trim() !== '' && userId !== 'anonymous') {
      const maxPerUser = voucher.max_usage_per_user || 1;
      const userUsedCount = await this.usageRepo.count({
        where: {
          voucher_id: voucher.id,
          user_id: userId.trim(),
          status: UsageStatus.USED,
        },
      });

      if (userUsedCount >= maxPerUser) {
        throw new NotFoundException(
          `Mã giảm giá '${normalizedCode}' không tồn tại hoặc đã hết hạn sử dụng.`,
        );
      }
    }

    let discountAmount = 0;
    if (voucher.discount_type === DiscountType.FIXED_AMOUNT) {
      discountAmount = Number(voucher.discount_value);
    } else if (voucher.discount_type === DiscountType.PERCENTAGE) {
      discountAmount = Math.round((orderValue * Number(voucher.discount_value)) / 100);
      if (voucher.max_discount_amount && discountAmount > Number(voucher.max_discount_amount)) {
        discountAmount = Number(voucher.max_discount_amount);
      }
    }

    // Nếu là mã freeship: mức giảm tối đa bằng đúng tiền phí vận chuyển
    if (isFreeshipVoucher) {
      const effectiveShippingFee =
        shippingFee !== undefined
          ? Number(shippingFee)
          : (orderValue >= 150000 ? 0 : 15000);
      if (discountAmount > effectiveShippingFee) {
        discountAmount = effectiveShippingFee;
      }
    } else if (discountAmount > orderValue) {
      discountAmount = orderValue;
    }

    return {
      valid: true,
      isValid: true,
      code: voucher.code,
      isFreeship: isFreeshipVoucher,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        max_discount_amount: voucher.max_discount_amount ? Number(voucher.max_discount_amount) : null,
        min_order_value: Number(voucher.min_order_value),
        max_usage_per_user: voucher.max_usage_per_user || 1,
        is_freeship: isFreeshipVoucher,
      },
      discountAmount,
      finalAmount: orderValue - discountAmount,
    };
  }

  // Tăng lượt sử dụng khi chốt đơn thành công và ghi nhật ký người dùng
  async claimVoucher(code: string, userId?: string, orderId?: string) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');

    if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
      throw new BadRequestException('Voucher đã hết số lượt sử dụng');
    }

    // 1. Tăng lượt dùng toàn hệ thống
    voucher.used_count += 1;
    await this.voucherRepo.save(voucher);

    // 2. Ghi nhật ký sử dụng của User cho đơn hàng này
    if (userId && orderId) {
      const usage = this.usageRepo.create({
        voucher_id: voucher.id,
        user_id: userId,
        order_id: orderId,
        status: UsageStatus.USED,
      });
      await this.usageRepo.save(usage);
    }

    return voucher;
  }

  // HOÀN LẠI MÃ CHO NGƯỜI DÙNG KHI HUỶ ĐƠN HOẶC ROLLBACK SAGA
  async releaseVoucher(code: string, userId?: string, orderId?: string) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });
    if (!voucher) {
      return { success: false, message: 'Voucher không tồn tại' };
    }

    // 1. Giảm tổng số lượt dùng toàn hệ thống
    if (voucher.used_count > 0) {
      voucher.used_count -= 1;
      await this.voucherRepo.save(voucher);
    }

    // 2. Chuyển trạng thái lượt dùng của User từ USED sang REFUNDED
    if (userId && orderId) {
      const usage = await this.usageRepo.findOne({
        where: {
          voucher_id: voucher.id,
          user_id: userId,
          order_id: orderId,
          status: UsageStatus.USED,
        },
      });

      if (usage) {
        usage.status = UsageStatus.REFUNDED;
        await this.usageRepo.save(usage);
        console.log(`[DiscountService] Đã hoàn lại lượt dùng mã ${normalizedCode} cho User ${userId} (Đơn #${orderId})`);
      }
    }

    return {
      success: true,
      message: `Đã mở lại mã giảm giá '${normalizedCode}' cho tài khoản thành công.`,
    };
  }

  // Admin tạo voucher
  async createVoucher(dto: CreateVoucherDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.voucherRepo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Mã voucher '${code}' đã tồn tại trong hệ thống.`);
    }

    const voucher = this.voucherRepo.create({
      ...dto,
      code,
      max_usage_per_user: dto.max_usage_per_user || 1,
      start_date: new Date(dto.start_date),
      end_date: new Date(dto.end_date),
    });
    return this.voucherRepo.save(voucher);
  }

  // Admin toggle bật/tắt voucher
  async toggleVoucher(id: string) {
    const voucher = await this.voucherRepo.findOne({ where: { id } });
    if (!voucher) throw new NotFoundException('Không tìm thấy voucher');
    voucher.is_active = !voucher.is_active;
    return this.voucherRepo.save(voucher);
  }
}
