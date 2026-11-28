import { IsString, IsInt, Min, Max, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên sản phẩm tối thiểu 2 ký tự' })
  @MaxLength(150, { message: 'Tên sản phẩm tối đa 150 ký tự' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Mô tả sản phẩm tối đa 1.000 ký tự' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá niêm yết phải là số nguyên (VNĐ)' })
  @Min(1000, { message: 'Giá niêm yết phải từ 1.000đ trở lên' })
  @Max(100_000_000, { message: 'Giá niêm yết không vượt quá 100.000.000đ' })
  base_price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL hình ảnh tối đa 500 ký tự' })
  image_url?: string;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'is_active phải là true hoặc false' })
  is_active?: boolean;

  @IsOptional()
  @IsString()
  curator_note?: string;
}
