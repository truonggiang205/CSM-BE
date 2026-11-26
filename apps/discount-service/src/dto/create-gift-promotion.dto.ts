import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateGiftPromotionDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên chương trình quà tặng không được để trống' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['BUY_X_GET_Y', 'MIN_ORDER_GIFT'])
  rule_type: 'BUY_X_GET_Y' | 'MIN_ORDER_GIFT';

  @IsOptional()
  @IsString()
  buy_product_id?: string | null;

  @IsOptional()
  @IsString()
  buy_product_name?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  buy_quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_amount?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'gift_product_id không được để trống' })
  gift_product_id: string;

  @IsOptional()
  @IsString()
  gift_product_name?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  gift_quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_gifts_per_order?: number;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
