import { IsNotEmpty, IsString, IsArray, ValidateNested, IsNumber, Min, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';

export class CreateOrderItemDto {
  @IsNotEmpty({ message: 'productId không được để trống' })
  @IsString()
  productId: string;

  @IsNumber({}, { message: 'quantity phải là số' })
  @Min(1, { message: 'Số lượng sản phẩm tối thiểu là 1' })
  quantity: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  productName?: string;
}

export class CreateOrderDto {
  @IsNotEmpty({ message: 'branchId không được để trống' })
  @IsString()
  branchId: string;

  @IsArray({ message: 'items phải là mảng sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsNotEmpty({ message: 'Địa chỉ giao hàng không được để trống' })
  @IsString()
  shippingAddress: string;

  @IsNotEmpty({ message: 'Phương thức thanh toán không được để trống' })
  @IsString()
  paymentMethod: string;
}

export class UpdateOrderStatusDto {
  @IsNotEmpty({ message: 'status không được để trống' })
  @IsEnum(OrderStatus, { message: 'Trạng thái đơn hàng không hợp lệ' })
  status: OrderStatus;
}
