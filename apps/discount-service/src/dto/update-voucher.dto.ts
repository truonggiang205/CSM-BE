import { IsString, IsOptional, IsEnum, IsNumber, Min, IsDateString, IsBoolean } from 'class-validator';
import { DiscountType } from '../entities/voucher.entity';

/** Chỉnh sửa voucher — mọi trường đều không bắt buộc, chỉ gửi trường cần đổi. */
export class UpdateVoucherDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiscountType)
  @IsOptional()
  discount_type?: DiscountType;

  @IsNumber()
  @Min(1)
  @IsOptional()
  discount_value?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  min_order_value?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  max_discount_amount?: number | null;

  @IsNumber()
  @Min(1)
  @IsOptional()
  usage_limit?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  max_usage_per_user?: number;

  @IsOptional()
  @IsBoolean()
  is_freeship?: boolean;

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  end_date?: string;
}
