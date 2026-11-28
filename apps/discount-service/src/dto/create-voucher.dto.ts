import { IsNotEmpty, IsString, IsEnum, IsNumber, Min, Max, MaxLength, IsOptional, IsDateString, IsBoolean, IsInt } from 'class-validator';
import { DiscountType } from '../entities/voucher.entity';

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã voucher' })
  @MaxLength(20, { message: 'Mã voucher tối đa 20 ký tự' })
  code: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @IsEnum(DiscountType)
  discount_type: DiscountType;

  @IsNumber({}, { message: 'Mức giảm phải là số' })
  @Min(1, { message: 'Mức giảm phải lớn hơn 0' })
  @Max(100_000_000, { message: 'Mức giảm không vượt quá 100.000.000đ' })
  discount_value: number;

  @IsNumber({}, { message: 'Đơn tối thiểu phải là số' })
  @Min(0, { message: 'Đơn tối thiểu không được âm' })
  @Max(100_000_000, { message: 'Đơn tối thiểu không vượt quá 100.000.000đ' })
  @IsOptional()
  min_order_value?: number;

  @IsNumber({}, { message: 'Giảm tối đa phải là số' })
  @Min(0, { message: 'Giảm tối đa không được âm' })
  @Max(100_000_000, { message: 'Giảm tối đa không vượt quá 100.000.000đ' })
  @IsOptional()
  max_discount_amount?: number;

  @IsInt({ message: 'Tổng lượt dùng phải là số nguyên' })
  @Min(1, { message: 'Tổng lượt dùng phải từ 1 trở lên' })
  @Max(1_000_000, { message: 'Tổng lượt dùng tối đa 1.000.000' })
  @IsOptional()
  usage_limit?: number;

  @IsInt({ message: 'Lượt dùng mỗi khách phải là số nguyên' })
  @Min(1, { message: 'Lượt dùng mỗi khách phải từ 1 trở lên' })
  @Max(100, { message: 'Lượt dùng mỗi khách tối đa 100' })
  @IsOptional()
  max_usage_per_user?: number;

  @IsOptional()
  @IsBoolean()
  is_freeship?: boolean;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;
}