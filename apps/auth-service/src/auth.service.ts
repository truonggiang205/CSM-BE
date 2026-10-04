import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  branch_id?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(body: { email: string; password: string; fullName?: string; role?: UserRole; branch_id?: string }) {
    const existing = await this.userRepository.findOne({ where: { email: body.email } });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(body.password, salt);

    const user = this.userRepository.create({
      email: body.email,
      password_hash,
      role: body.role || UserRole.CUSTOMER,
      branch_id: body.branch_id || undefined,
    });

    const saved = await this.userRepository.save(user);
    const tokens = await this.generateTokens(saved);

    return {
      message: 'Đăng ký tài khoản thành công',
      user: {
        id: saved.id,
        email: saved.email,
        role: saved.role,
        branch_id: saved.branch_id,
        fullName: body.fullName || saved.email.split('@')[0],
      },
      ...tokens,
    };
  }

  async login(body: { email: string; password: string }) {
    const user = await this.userRepository.findOne({ where: { email: body.email } });
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

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'csm-super-secret-refresh-key',
      });

      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      return await this.generateTokens(user);
    } catch {
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
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id || undefined,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'csm-super-secret-refresh-key',
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
