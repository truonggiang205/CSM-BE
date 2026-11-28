import { IsNotEmpty, IsString, IsNumber, Min, Max, MaxLength, MinLength, Matches, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  /** Không bắt buộc: bỏ trống thì hệ thống tự sinh dạng SP-yymmdd-XXXX. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9-]{3,40}$/, { message: 'Mã SKU chỉ gồm chữ in hoa, số, dấu gạch ngang (3-40 ký tự)' })
  sku?: string;

  @Transform(trim)
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @IsString()
  @MinLength(2, { message: 'Tên sản phẩm tối thiểu 2 ký tự' })
  @MaxLength(150, { message: 'Tên sản phẩm tối đa 150 ký tự' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Mô tả sản phẩm tối đa 1.000 ký tự' })
  description?: string;

  @IsNotEmpty({ message: 'Giá niêm yết không được để trống' })
  @Type(() => Number)
  @IsInt({ message: 'Giá niêm yết phải là số nguyên (VNĐ)' })
  @Min(1000, { message: 'Giá niêm yết phải từ 1.000đ trở lên' })
  @Max(100_000_000, { message: 'Giá niêm yết không vượt quá 100.000.000đ' })
  base_price: number;

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
