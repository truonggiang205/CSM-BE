import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FlashSaleDiscountType } from '../entities/flash-sale-item.entity';

export class CreateFlashSaleItemDto {
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsString()
  @IsNotEmpty()
  product_name: string;

  @IsString()
  @IsOptional()
  product_image?: string;

  @IsNumber()
  @IsNotEmpty()
  original_price: number;

  /** Giá sale cuối. Có thể bỏ trống nếu gửi discount_type + discount_value (server tự tính). */
  @IsNumber()
  @IsOptional()
  sale_price?: number;

  @IsNumber()
  @IsOptional()
  discount_percentage?: number;

  @IsIn(Object.values(FlashSaleDiscountType))
  @IsOptional()
  discount_type?: FlashSaleDiscountType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount_value?: number;

  @IsNumber()
  @IsOptional()
  quantity_limit?: number;

  @IsNumber()
  @IsOptional()
  max_per_user?: number;
}

export class CreateFlashSaleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  apply_date?: string;

  @IsString()
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsOptional()
  end_date?: string;

  @IsString()
  @IsNotEmpty()
  start_time: string;

  @IsString()
  @IsNotEmpty()
  end_time: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  banner_url?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFlashSaleItemDto)
  items: CreateFlashSaleItemDto[];
}
