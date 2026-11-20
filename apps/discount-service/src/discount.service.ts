import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Injectable()
export class DiscountService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

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

    if (voucher.used_count >= voucher.usage_limit) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết lượt sử dụng.`);
    }

    if (Number(orderValue) < Number(voucher.min_order_value)) {
      const minValFormatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.min_order_value);
      throw new BadRequestException(`Đơn hàng phải đạt tối thiểu ${minValFormatted} để áp dụng mã này.`);
    }

    // Tính toán số tiền được giảm
    let discountAmount = 0;
    if (voucher.discount_type === DiscountType.FIXED_AMOUNT) {
      discountAmount = Number(voucher.discount_value);
    } else if (voucher.discount_type === DiscountType.PERCENTAGE) {
      discountAmount = (Number(orderValue) * Number(voucher.discount_value)) / 100;
      if (voucher.max_discount_amount && discountAmount > Number(voucher.max_discount_amount)) {
        discountAmount = Number(voucher.max_discount_amount);
      }
    }

    // Không cho phép giảm vượt quá tổng giá trị đơn
    discountAmount = Math.min(discountAmount, Number(orderValue));
    const finalAmount = Math.max(0, Number(orderValue) - discountAmount);

    return {
      valid: true,
      code: voucher.code,
      discountAmount,
      finalAmount,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
      },
    };
  }

  // Tăng lượt dùng (Claim voucher khi chốt đơn thành công)
  async claimVoucher(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');

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