import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  branch_id?: string;
  type: 'access' | 'refresh';
}

const PHONE_REGEX = /^(\+84|0)\d{9,10}$/;

/** Chuẩn hoá họ tên: bỏ khoảng trắng thừa; chuỗi rỗng => null */
function normalizeName(value?: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, 100) : null;
}

/** Chuẩn hoá SĐT: bỏ khoảng trắng/dấu chấm/gạch; chuỗi rỗng => null */
function normalizePhone(value?: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\s.\-()]/g, '');
  return v || null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(body: { email?: string; password?: string; fullName?: string; [key: string]: any }) {
    if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
      throw new BadRequestException('Email không hợp lệ');
    }
    if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có độ dài ít nhất 6 ký tự');
    }

    const email = body.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const full_name = normalizeName(body.fullName);
    const phone = normalizePhone(body.phone);
    if (phone && !PHONE_REGEX.test(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ (bắt đầu bằng 0 hoặc +84, 10–11 chữ số)');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(body.password, salt);

    // BẢO MẬT: Đăng ký luôn luôn gán role là CUSTOMER và bỏ qua mọi role/branch_id do client truyền lên
    const user = this.userRepository.create({
      email,
      password_hash,
      role: UserRole.CUSTOMER,
      branch_id: undefined,
      full_name,
      phone,
    });

    const saved = await this.userRepository.save(user);
    const tokens = await this.generateTokens(saved);

    return {
      message: 'Đăng ký tài khoản thành công',
      user: this.toPublicUser(saved),
      ...tokens,
    };
  }

  async login(body: { email?: string; password?: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Vui lòng cung cấp đầy đủ email và mật khẩu');
    }

    const email = body.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isMatch = await bcrypt.compare(body.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const tokens = await this.generateTokens(user);

    return {
      message: 'Đăng nhập thành công',
      user: this.toPublicUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không được để trống');
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error('[ConfigError] Thiếu biến môi trường bắt buộc: JWT_REFRESH_SECRET');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      // BẢO MẬT: Bắt buộc claim type phải là 'refresh', từ chối access token
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token không phải là refresh token (từ chối access token)');
      }

      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      return await this.generateTokens(user);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  /** Thông tin công khai của người dùng (không bao giờ trả password_hash) */
  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id ?? null,
      fullName: user.full_name || user.email.split('@')[0],
      phone: user.phone ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  async getProfile(userId: string) {
    const user = await this.findUserOrThrow(userId);
    return this.toPublicUser(user);
  }

  async updateProfile(userId: string, body: { fullName?: string; phone?: string }) {
    const user = await this.findUserOrThrow(userId);

    if (body.fullName !== undefined) {
      const full_name = normalizeName(body.fullName);
      if (!full_name || full_name.length < 2) {
        throw new BadRequestException('Họ tên phải có ít nhất 2 ký tự');
      }
      user.full_name = full_name;
    }

    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (phone && !PHONE_REGEX.test(phone)) {
        throw new BadRequestException('Số điện thoại không hợp lệ (bắt đầu bằng 0 hoặc +84, 10–11 chữ số)');
      }
      user.phone = phone;
    }

    const saved = await this.userRepository.save(user);
    return {
      message: 'Cập nhật hồ sơ thành công',
      user: this.toPublicUser(saved),
    };
  }

  async changePassword(userId: string, body: { currentPassword?: string; newPassword?: string }) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const user = await this.findUserOrThrow(userId);
    const isMatch = await bcrypt.compare(body.currentPassword, user.password_hash);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }
    if (await bcrypt.compare(body.newPassword, user.password_hash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(body.newPassword, salt);
    await this.userRepository.save(user);
    return { message: 'Đổi mật khẩu thành công' };
  }

  private async generateTokens(user: User) {
    const accessSecret = process.env.JWT_SECRET;
    if (!accessSecret) {
      throw new Error('[ConfigError] Thiếu biến môi trường bắt buộc: JWT_SECRET');
    }
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error('[ConfigError] Thiếu biến môi trường bắt buộc: JWT_REFRESH_SECRET');
    }

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id || undefined,
      type: 'access',
    };

    const refreshPayload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: '15m',
      secret: accessSecret,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: '7d',
      secret: refreshSecret,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async getUsers(requesterRole: UserRole | undefined, role?: string) {
    // BẢO MẬT: khách hàng không được xem danh sách tài khoản của hệ thống
    if (!requesterRole || requesterRole === UserRole.CUSTOMER) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách người dùng');
    }
    const where = role ? { role: role as UserRole } : {};
    const users = await this.userRepository.find({
      where,
      select: ['id', 'email', 'role', 'branch_id', 'full_name', 'phone', 'created_at', 'updated_at'],
      order: { created_at: 'DESC' },
    });
    return users.map((u) => this.toPublicUser(u));
  }
}
