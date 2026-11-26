import { BadRequestException, ForbiddenException } from '@nestjs/common';

export interface StorefrontActor {
  role: string;
  userId: string | null;
  branchId: string | null;
}

/** Đọc định danh người dùng do API Gateway chuyển tiếp (x-user-*, x-branch-id). */
export function getActor(headers: Record<string, any>): StorefrontActor {
  const pick = (v: any) => (Array.isArray(v) ? v[0] : v);
  const role = String(pick(headers['x-user-role']) || '');
  const userId = pick(headers['x-user-id']) || null;
  const branchId = pick(headers['x-branch-id']) || null;
  return { role, userId, branchId: branchId ? String(branchId) : null };
}

/** Chuẩn hoá branch_id từ query/body: '', 'global', 'null' => null (toàn chuỗi). */
export function normalizeBranchId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (!v || v === 'global' || v === 'null') return null;
  return v;
}

/**
 * Xác định phạm vi (branch_id) mà người dùng được phép thao tác.
 * - ADMIN: thao tác được toàn chuỗi (null) hoặc bất kỳ chi nhánh nào.
 * - BRANCH_MANAGER: chỉ chi nhánh của mình; nếu không truyền thì mặc định chi nhánh của mình.
 */
export function resolveWritableBranch(actor: StorefrontActor, requested: unknown): string | null {
  const branchId = normalizeBranchId(requested);

  if (actor.role === 'ADMIN') {
    return branchId;
  }

  if (actor.role === 'BRANCH_MANAGER') {
    if (!actor.branchId) {
      throw new ForbiddenException('Tài khoản quản lý chưa được gán chi nhánh');
    }
    if (requested !== undefined && requested !== null && String(requested).trim() !== '' && branchId !== actor.branchId) {
      throw new ForbiddenException('Quản lý chi nhánh chỉ được tùy chỉnh trang chủ của chi nhánh mình');
    }
    return actor.branchId;
  }

  throw new ForbiddenException('Bạn không có quyền tùy chỉnh trang chủ');
}

/** Kiểm tra người dùng có quyền sửa/xóa một bản ghi thuộc branch_id cho trước hay không. */
export function assertCanManage(actor: StorefrontActor, recordBranchId: string | null): void {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'BRANCH_MANAGER' && actor.branchId && recordBranchId === actor.branchId) return;
  throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung này');
}

export function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Ngày không hợp lệ');
  }
  return d;
}

export function assertDateRange(start: Date | null | undefined, end: Date | null | undefined): void {
  if (start && end && start.getTime() > end.getTime()) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
}

/** Bản ghi đang hiệu lực: bật và nằm trong khoảng ngày (nếu có). */
export function isLive(
  record: { is_active: boolean; start_at: Date | null; end_at: Date | null },
  now: Date = new Date(),
): boolean {
  if (!record.is_active) return false;
  if (record.start_at && new Date(record.start_at).getTime() > now.getTime()) return false;
  if (record.end_at && new Date(record.end_at).getTime() < now.getTime()) return false;
  return true;
}
