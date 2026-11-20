import { Injectable, OnModuleInit, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Injectable()
export class DiscountService implements OnModuleInit {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
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

  // Lấy danh sách voucher công khai còn hiệu lực
  async getPublicVouchers() {
    const now = new Date();
    return this.voucherRepo.find({
      where: {
        is_active: true,
        start_date: LessThanOrEqual(now),
        end_date: MoreThanOrEqual(now),
      },
      order: { created_at: 'DESC' },
    });
  }

  // Lấy toàn bộ danh sách voucher (dành cho Admin)
  async getAllVouchers() {
    return this.voucherRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  // Thuật toán kiểm tra tính hợp lệ và tính số tiền giảm
  async validateVoucher(code: string, orderValue: number) {
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
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết lượt sử dụng.`);
    }

    if (orderValue < Number(voucher.min_order_value)) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${Number(voucher.min_order_value).toLocaleString('vi-VN')}đ để dùng mã này.`,
      );
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

    if (discountAmount > orderValue) {
      discountAmount = orderValue;
    }

    return {
      valid: true,
      isValid: true,
      code: voucher.code,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        max_discount_amount: voucher.max_discount_amount ? Number(voucher.max_discount_amount) : null,
        min_order_value: Number(voucher.min_order_value),
      },
      discountAmount,
      finalAmount: orderValue - discountAmount,
    };
  }

  // Tăng lượt sử dụng khi chốt đơn thành công
  async claimVoucher(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');

    if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
      throw new BadRequestException('Voucher đã hết số lượt sử dụng');
    }

    voucher.used_count += 1;
    return this.voucherRepo.save(voucher);
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
