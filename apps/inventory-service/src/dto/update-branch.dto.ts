import { IsString, IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Vĩ độ (latitude) phải là số' })
  @Min(-90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90' })
  @Max(90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Kinh độ (longitude) phải là số' })
  @Min(-180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180' })
  @Max(180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180' })
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
