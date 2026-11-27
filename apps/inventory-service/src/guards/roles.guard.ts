import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const userRole = req.headers['x-user-role'] || req.user?.role;
    const userBranchId = req.headers['x-branch-id'] || req.user?.branch_id;

    if (!userRole) {
      throw new ForbiddenException('Không tìm thấy quyền hạn người dùng');
    }

    const hasRole = requiredRoles.includes(userRole);
    if (!hasRole) {
      throw new ForbiddenException(`Quyền truy cập bị từ chối: Yêu cầu vai trò [${requiredRoles.join(', ')}]`);
    }

    // Kiểm tra phạm vi chi nhánh cho BRANCH_MANAGER khi nhập kho
    if (userRole === 'BRANCH_MANAGER') {
      const targetBranchId = req.body?.branchId || req.params?.branchId;
      if (targetBranchId && userBranchId && targetBranchId.toString() !== userBranchId.toString()) {
        throw new ForbiddenException('Quản lý chi nhánh chỉ được phép thao tác trên đúng chi nhánh được phân công');
      }
    }

    return true;
  }
}
