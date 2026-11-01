import { IsOptional, IsString, IsInt, Min, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProductDto {
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi ký tự' })
  q?: string;

  @IsOptional()
  @IsString({ message: 'categoryId phải là chuỗi ký tự' })
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minPrice phải là số' })
  @Min(0, { message: 'minPrice không được nhỏ hơn 0' })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'maxPrice phải là số' })
  @Min(0, { message: 'maxPrice không được nhỏ hơn 0' })
  maxPrice?: number;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'name'], {
    message: 'sort phải là một trong các giá trị: price_asc, price_desc, name',
  })
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  limit?: number = 10;
}
