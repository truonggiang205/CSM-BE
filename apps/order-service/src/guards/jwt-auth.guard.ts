import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Vì hệ thống hiện tại đang mock login bằng token chuỗi cứng: 'jwt_mock_token_for_...'
      // ta sẽ mock xác thực ở đây để khỏi cần setup khóa JWT bí mật phức tạp.
      if (authHeader && authHeader.includes('jwt_mock_token')) {
         request.user = { id: 1, email: 'mock_user@example.com' };
         return true;
      }
      throw new UnauthorizedException('Token không hợp lệ hoặc không tồn tại');
    }

    const token = authHeader.split(' ')[1];
    
    // Mock xử lý token từ auth-service trả về
    if (token.startsWith('jwt_mock_token_for_')) {
      request.user = { id: 1, email: token.replace('jwt_mock_token_for_', '') };
      return true;
    }

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Token hết hạn hoặc sai chữ ký');
    }
  }
}
