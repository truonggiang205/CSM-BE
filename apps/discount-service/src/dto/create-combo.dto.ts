import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateComboItemDto {
  @IsString()
  @IsNotEmpty({ message: 'product_id không được để trống' })
  product_id: string;

  @IsOptional()
  @IsString()
  product_name?: string;

  @IsOptional()
  @IsString()
  product_image?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  original_price?: number;

  @IsNumber()
  @Min(1, { message: 'Số lượng món trong combo tối thiểu là 1' })
  quantity: number;
}

export class CreateComboDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên combo không được để trống' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({}, { message: 'Giá bán Combo phải là số' })
  @Min(1000, { message: 'Giá bán Combo phải từ 1.000đ trở lên' })
  combo_price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  original_price?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_quantity?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsArray({ message: 'Danh sách món trong combo phải là mảng' })
  @ArrayMinSize(1, { message: 'Combo phải có ít nhất 1 sản phẩm thành phần' })
  @ValidateNested({ each: true })
  @Type(() => CreateComboItemDto)
  items: CreateComboItemDto[];
}

