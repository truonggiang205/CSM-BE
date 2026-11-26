import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateVoucherDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã voucher không được để trống' })
  code: string;

  @IsNumber()
  @Min(0, { message: 'Giá trị đơn hàng phải lớn hơn hoặc bằng 0' })
  orderValue: number;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsNumber()
  @Min(0, { message: 'Phí vận chuyển phải lớn hơn hoặc bằng 0' })
  @IsOptional()
  shippingFee?: number;
}
