import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBannerDto {
  @IsNotEmpty({ message: 'Tiêu đề banner không được để trống' })
  @IsString()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  highlight?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  badge?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsNotEmpty({ message: 'Ảnh banner không được để trống' })
  @IsString()
  @MaxLength(500)
  image_url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  cta_text?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'start_at phải là ngày hợp lệ (ISO 8601)' })
  start_at?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'end_at phải là ngày hợp lệ (ISO 8601)' })
  end_at?: string | null;

  /** NULL/không gửi = toàn chuỗi (chỉ ADMIN). BRANCH_MANAGER luôn bị gán chi nhánh của mình. */
  @IsOptional()
  @IsString()
  branch_id?: string | null;
}

export class UpdateBannerDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(150) highlight?: string | null;
  @IsOptional() @IsString() @MaxLength(80) badge?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) image_url?: string;
  @IsOptional() @IsString() @MaxLength(500) link_url?: string | null;
  @IsOptional() @IsString() @MaxLength(60) cta_text?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsDateString() start_at?: string | null;
  @IsOptional() @IsDateString() end_at?: string | null;
}

export class ReorderBannersDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

export class SectionItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(36)
  product_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}

export class UpsertSectionDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string | null;
  @IsOptional() @IsString() @MaxLength(255) subtitle?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsDateString() start_at?: string | null;
  @IsOptional() @IsDateString() end_at?: string | null;

  @IsOptional()
  @IsString()
  branch_id?: string | null;

  @IsArray()
  @ArrayMaxSize(20, { message: 'Mỗi khối tối đa 20 sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => SectionItemDto)
  items: SectionItemDto[];
}
