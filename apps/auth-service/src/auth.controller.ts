import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  Res,
  Param,
  Query,
  UseGuards,
  UseFilters,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { MAX_AVATAR_SIZE, resolveAvatarPath } from './utils/avatar-storage';
import { MulterExceptionFilter } from './filters/multer-exception.filter';
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

  /** POST /auth/avatar (multipart, field "avatar") — tải/đổi ảnh đại diện */
  @UseGuards(AuthGuard)
  @Post('avatar')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: MAX_AVATAR_SIZE } }))
  uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    return this.authService.updateAvatar(req.user.sub || req.user.id, file);
  }

  @UseGuards(AuthGuard)
  @Delete('avatar')
  removeAvatar(@Req() req: any) {
    return this.authService.removeAvatar(req.user.sub || req.user.id);
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

/**
 * Phục vụ ảnh đại diện khi chạy dev không có volume dùng chung
 * (api-gateway dự phòng gọi sang đây nếu không thấy file trên đĩa của nó).
 */
@Controller('uploads')
export class AvatarFileController {
  @Get(':filename')
  getAvatar(@Param('filename') filename: string, @Res() res: Response) {
    const target = resolveAvatarPath(filename);
    if (!target || !fs.existsSync(target)) {
      throw new NotFoundException('Không tìm thấy ảnh');
    }
    return res.sendFile(target);
  }
}
