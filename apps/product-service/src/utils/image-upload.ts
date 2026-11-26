import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Kiểm tra định dạng/dung lượng ảnh và lưu vào UPLOAD_DIR với tên ngẫu nhiên.
 * Trả về đường dẫn tương đối dạng /uploads/<uuid>.<ext>.
 */
export async function saveUploadedImage(file?: Express.Multer.File): Promise<string> {
  if (!file) {
    throw new BadRequestException('Vui lòng tải lên tệp hình ảnh');
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new BadRequestException('Dung lượng ảnh vượt quá 2MB');
  }

  const allowed: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!allowed[ext] || allowed[ext] !== mime) {
    throw new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP');
  }

  const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
  const randomFilename = `${crypto.randomUUID()}${normalizedExt}`;

  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const targetFilePath = path.resolve(uploadDir, randomFilename);
  if (!targetFilePath.startsWith(uploadDir + path.sep)) {
    throw new BadRequestException('Đường dẫn lưu tệp không hợp lệ');
  }

  await fs.promises.writeFile(targetFilePath, file.buffer);
  return `/uploads/${randomFilename}`;
}
