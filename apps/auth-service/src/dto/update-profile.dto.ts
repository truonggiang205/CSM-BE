import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName?: string;

  @IsOptional()
  @IsString()
  // Cho phép khoảng trắng/dấu chấm/gạch khi nhập; service sẽ chuẩn hoá và kiểm tra chặt (0|+84 + 9–10 số)
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự' })
  @Matches(/^[+\d\s.\-()]*$/, {
    message: 'Số điện thoại chỉ được chứa chữ số, dấu +, khoảng trắng, dấu chấm hoặc gạch ngang',
  })
  phone?: string;
}
