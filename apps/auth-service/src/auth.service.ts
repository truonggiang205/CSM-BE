import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
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

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(body.password, salt);

    // BẢO MẬT: Đăng ký luôn luôn gán role là CUSTOMER và bỏ qua mọi role/branch_id do client truyền lên
    const user = this.userRepository.create({
      email,
      password_hash,
      role: UserRole.CUSTOMER,
      branch_id: undefined,
    });

    const saved = await this.userRepository.save(user);
    const tokens = await this.generateTokens(saved);

    return {
      message: 'Đăng ký tài khoản thành công',
      user: {
        id: saved.id,
        email: saved.email,
        role: saved.role,
        fullName: (body.fullName && String(body.fullName).trim()) || saved.email.split('@')[0],
      },
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
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        branch_id: user.branch_id,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không được để trống');
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'csm-super-secret-refresh-key-min-32-chars';

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

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id,
      created_at: user.created_at,
    };
  }

  private async generateTokens(user: User) {
    const accessSecret = process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'csm-super-secret-refresh-key-min-32-chars';

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
}
