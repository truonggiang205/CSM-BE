import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(|(\+84|0)\d{9,10})$/, {
    message: 'Số điện thoại không hợp lệ (bắt đầu bằng 0 hoặc +84, 10–11 chữ số)',
  })
  phone?: string;
}
