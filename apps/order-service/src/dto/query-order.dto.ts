import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';

export class QueryMyOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Trạng thái đơn hàng không hợp lệ' })
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit?: number = 10;
}

export class QueryOrderDto extends QueryMyOrderDto {
  @IsOptional()
  @IsString({ message: 'branchId phải là chuỗi' })
  branchId?: string;

  @IsOptional()
  @IsString({ message: 'search phải là chuỗi' })
  search?: string;

  @IsOptional()
  @IsString({ message: 'fromDate phải là chuỗi định dạng ngày' })
  fromDate?: string;

  @IsOptional()
  @IsString({ message: 'toDate phải là chuỗi định dạng ngày' })
  toDate?: string;
}
