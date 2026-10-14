import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 0. Hỗ trợ cuộc gọi nội bộ an toàn giữa các microservices qua x-internal-secret
    const internalSecret = process.env.INTERNAL_SECRET;
    if (internalSecret && request.headers['x-internal-secret'] === internalSecret) {
      request.user = {
        id: 'internal-system',
        sub: 'internal-system',
        email: 'system@internal.csm.vn',
        role: 'SYSTEM',
      };
      return true;
    }

    // 1. Nhận thông tin đã được Gateway xác thực qua headers an toàn
    const gatewayUserId = request.headers['x-user-id'];
    const gatewayUserRole = request.headers['x-user-role'];
    const gatewayBranchId = request.headers['x-branch-id'];
    const gatewayUserEmail = request.headers['x-user-email'];

    if (gatewayUserId) {
      request.user = {
        id: gatewayUserId,
        sub: gatewayUserId,
        email: gatewayUserEmail,
        role: gatewayUserRole,
        branch_id: gatewayBranchId,
      };
      return true;
    }

    // 2. Dự phòng: Kiểm tra token trực tiếp nếu gọi nội bộ không qua Gateway
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token không hợp lệ hoặc không tồn tại');
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me',
      });
      request.user = {
        ...payload,
        id: payload.sub || payload.id,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token hết hạn hoặc sai chữ ký');
    }
  }
}
