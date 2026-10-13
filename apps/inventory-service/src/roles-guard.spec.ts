import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';

describe('RolesGuard Test (Tu choi dung role & phan quyen chi nhanh)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockExecutionContext(headers: Record<string, string>, body: any = {}, params: any = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          params,
          user: null,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it('1. Endpoint khong yeu cau role -> Cho phep truy cap (true)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const context = createMockExecutionContext({});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('2. Khong co header role hoac user -> Tu choi 403 Forbidden', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockExecutionContext({});
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Không tìm thấy quyền hạn người dùng'),
    );
  });

  it('3. User co role CUSTOMER goi endpoint yeu cau [ADMIN, BRANCH_MANAGER] -> Tu choi 403 Forbidden', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'BRANCH_MANAGER']);
    const context = createMockExecutionContext({ 'x-user-role': 'CUSTOMER' });
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Quyền truy cập bị từ chối: Yêu cầu vai trò [ADMIN, BRANCH_MANAGER]'),
    );
  });

  it('4. User co role ADMIN goi endpoint yeu cau [ADMIN] -> Cho phep truy cap (true)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockExecutionContext({ 'x-user-role': 'ADMIN' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('5. BRANCH_MANAGER thao tac sai chi nhanh -> Tu choi 403 Forbidden', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['BRANCH_MANAGER']);
    const context = createMockExecutionContext(
      { 'x-user-role': 'BRANCH_MANAGER', 'x-branch-id': 'br-01' },
      { branchId: 'br-02' }, // Body muốn tác động lên chi nhánh br-02
    );
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Quản lý chi nhánh chỉ được phép thao tác trên đúng chi nhánh được phân công'),
    );
  });

  it('6. BRANCH_MANAGER thao tac dung chi nhanh -> Cho phep truy cap (true)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['BRANCH_MANAGER']);
    const context = createMockExecutionContext(
      { 'x-user-role': 'BRANCH_MANAGER', 'x-branch-id': 'br-01' },
      { branchId: 'br-01' }, // Trùng khớp br-01
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});
