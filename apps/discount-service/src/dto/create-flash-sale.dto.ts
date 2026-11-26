import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsNumber()
  @IsNotEmpty()
  sale_price: number;

  @IsNumber()
  @IsOptional()
  discount_percentage?: number;

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
