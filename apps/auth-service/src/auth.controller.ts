import { Controller, Post, Get, Patch, Body, Req, Query, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'auth-service' };
  }

  @Post('register')

  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.sub || req.user.id);
  }

  @UseGuards(AuthGuard)
  @Patch('profile')
  updateProfile(@Req() req: any, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.sub || req.user.id, body);
  }

  @UseGuards(AuthGuard)
  @Patch('change-password')
  changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub || req.user.id, body);
  }

  @UseGuards(AuthGuard)
  @Get('users')
  getUsers(@Req() req: any, @Query('role') role?: string) {
    return this.authService.getUsers(req.user?.role, role);
  }
}
