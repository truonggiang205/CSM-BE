import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
export const AVATAR_PREFIX = 'avatar-';

const ALLOWED: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Chữ ký đầu tệp (magic bytes) để chặn file giả đuôi ảnh */
function looksLikeImage(buf: Buffer, ext: string): boolean {
  if (!buf || buf.length < 12) return false;
  if (ext === '.png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === '.webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

/** Thư mục lưu ảnh dùng chung với product-service/api-gateway (biến UPLOAD_DIR) */
export function getUploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
}

/**
 * Kiểm tra (đuôi, MIME, magic bytes, dung lượng) rồi lưu ảnh đại diện.
 * Trả về đường dẫn tương đối dạng /uploads/avatar-<uuid>.<ext>.
 */
export async function saveAvatar(file?: Express.Multer.File): Promise<string> {
  if (!file) {
    throw new BadRequestException('Vui lòng chọn ảnh đại diện');
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new BadRequestException('Dung lượng ảnh vượt quá 2MB');
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED[ext] || ALLOWED[ext] !== mime || !looksLikeImage(file.buffer, ext)) {
    throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP');
  }

  const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
  const filename = `${AVATAR_PREFIX}${crypto.randomUUID()}${normalizedExt}`;
  const uploadDir = getUploadDir();
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const target = path.resolve(uploadDir, filename);
  if (!target.startsWith(uploadDir + path.sep)) {
    throw new BadRequestException('Đường dẫn lưu tệp không hợp lệ');
  }
  await fs.promises.writeFile(target, file.buffer);
  return `/uploads/${filename}`;
}

/** Xoá ảnh đại diện cũ (chỉ xoá file do auth-service tạo, có tiền tố avatar-) */
export async function removeAvatarFile(avatarUrl?: string | null): Promise<void> {
  if (!avatarUrl) return;
  const filename = path.basename(avatarUrl);
  if (!filename.startsWith(AVATAR_PREFIX) || filename !== avatarUrl.replace(/^\/uploads\//, '')) return;
  const uploadDir = getUploadDir();
  const target = path.resolve(uploadDir, filename);
  if (!target.startsWith(uploadDir + path.sep)) return;
  await fs.promises.unlink(target).catch(() => undefined);
}

/** Trả về đường dẫn tuyệt đối an toàn của một ảnh đại diện, hoặc null nếu tên không hợp lệ */
export function resolveAvatarPath(filename: string): string | null {
  if (!filename || filename !== path.basename(filename) || /[\\/%]|\.\./.test(filename)) return null;
  if (!filename.startsWith(AVATAR_PREFIX)) return null;
  const uploadDir = getUploadDir();
  const target = path.resolve(uploadDir, filename);
  return target.startsWith(uploadDir + path.sep) ? target : null;
}
