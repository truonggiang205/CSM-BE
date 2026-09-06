import { Controller, Post, Get, Body } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('register')
  register(@Body() body: any) {
    return {
      message: 'Đăng ký tài khoản thành công',
      user: {
        id: 1,
        email: body.email || 'user@example.com',
        fullName: body.fullName || 'Nguyễn Văn A',
        role: 'CUSTOMER',
      },
    };
  }

  @Post('login')
  login(@Body() body: any) {
    return {
      message: 'Đăng nhập thành công',
      accessToken: 'jwt_mock_token_for_' + (body.email || 'user'),
      user: {
        id: 1,
        email: body.email || 'user@example.com',
        fullName: 'Nguyễn Văn A',
        role: 'CUSTOMER',
      },
    };
  }

  @Get('profile')
  getProfile() {
    return {
      id: 1,
      email: 'customer@example.com',
      fullName: 'Nguyễn Văn A',
      role: 'CUSTOMER',
    };
  }
}
