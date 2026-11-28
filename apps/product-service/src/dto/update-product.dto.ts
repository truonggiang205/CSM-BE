import { IsString, IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'base_price phải là số' })
  @Min(0, { message: 'base_price không được âm' })
  base_price?: number;

  @IsOptional()
  @IsString()
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
