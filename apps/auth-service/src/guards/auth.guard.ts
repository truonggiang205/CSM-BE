import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Không có quyền truy cập');
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me',
      });

      // Từ chối refresh token khi dùng làm access bearer token
      if (payload.type && payload.type !== 'access') {
        throw new UnauthorizedException('Token không phải là access token (từ chối refresh token)');
      }

      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ, không đúng loại hoặc đã hết hạn');
    }
  }
}
