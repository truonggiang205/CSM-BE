import { IsNotEmpty, IsString, IsEnum, IsNumber, Min, IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { DiscountType } from '../entities/voucher.entity';

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiscountType)
  discount_type: DiscountType;

  @IsNumber()
  @Min(1)
  discount_value: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  min_order_value?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  max_discount_amount?: number;

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
  start_date: string;

  @IsDateString()
  end_date: string;
}