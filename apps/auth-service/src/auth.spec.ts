import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, UserRole } from './entities/user.entity';

describe('Auth Service Flow Test (Register / Login / Refresh)', () => {
  let authService: AuthService;
  let userRepository: any;
  let jwtService: any;

  const mockUsers: User[] = [];

  beforeEach(async () => {
    mockUsers.length = 0;

    userRepository = {
      findOne: jest.fn().mockImplementation(async (query: any) => {
        if (query.where?.email) {
          return mockUsers.find((u) => u.email === query.where.email) || null;
        }
        if (query.where?.id) {
          return mockUsers.find((u) => u.id === query.where.id) || null;
        }
        return null;
      }),
      create: jest.fn().mockImplementation((data: any) => ({
        id: 'usr-generated-' + Math.random(),
        created_at: new Date(),
        updated_at: new Date(),
        ...data,
      })),
      save: jest.fn().mockImplementation(async (user: any) => {
        mockUsers.push(user);
        return user;
      }),
    };

    jwtService = {
      sign: jest.fn().mockImplementation((payload: any, options: any) => {
        return `mock-jwt-token-${payload.type}-${payload.sub}`;
      }),
      verify: jest.fn().mockImplementation((token: string, options: any) => {
        if (token.includes('invalid')) {
          throw new Error('Invalid token');
        }
        if (token.includes('access')) {
          return { sub: 'usr-01', email: 'test@csm.vn', role: UserRole.CUSTOMER, type: 'access' };
        }
        return { sub: 'usr-01', email: 'test@csm.vn', role: UserRole.CUSTOMER, type: 'refresh' };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('1. Đăng ký tài khoản (Register)', () => {
    it('Đăng ký hợp lệ -> Hash mật khẩu và LUÔN ÉP role = CUSTOMER', async () => {
      const res = await authService.register({
        email: 'customer.new@csm.vn',
        password: 'Password123!',
        fullName: 'Khách Hàng Mới',
        role: 'ADMIN', // Cố tình truyền role ADMIN để test chống privilege escalation
        branch_id: 'br-01',
      });

      expect(res.message).toBe('Đăng ký tài khoản thành công');
      expect(res.user.email).toBe('customer.new@csm.vn');
      expect(res.user.role).toBe(UserRole.CUSTOMER); // Bắt buộc là CUSTOMER
      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();

      // Kiểm tra trong DB: mật khẩu đã được hash (không lưu plain text)
      const savedInDb = mockUsers.find((u) => u.email === 'customer.new@csm.vn');
      expect(savedInDb).toBeDefined();
      expect(savedInDb?.password_hash).not.toBe('Password123!');
      const isMatch = await bcrypt.compare('Password123!', savedInDb!.password_hash);
      expect(isMatch).toBe(true);
    });

    it('Đăng ký với email trùng lặp -> Ném ConflictException (409)', async () => {
      await authService.register({ email: 'duplicate@csm.vn', password: 'Password123!' });
      await expect(
        authService.register({ email: 'duplicate@csm.vn', password: 'Password123!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('Đăng ký mật khẩu dưới 6 ký tự -> Ném BadRequestException (400)', async () => {
      await expect(
        authService.register({ email: 'short@csm.vn', password: '123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Đăng nhập (Login)', () => {
    beforeEach(async () => {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('CorrectPass123!', salt);
      mockUsers.push({
        id: 'usr-01',
        email: 'test@csm.vn',
        password_hash,
        role: UserRole.CUSTOMER,
        branch_id: null as any,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('Đăng nhập đúng email & password -> Trả về Access Token và Refresh Token', async () => {
      const res = await authService.login({
        email: 'test@csm.vn',
        password: 'CorrectPass123!',
      });

      expect(res.message).toBe('Đăng nhập thành công');
      expect(res.user.email).toBe('test@csm.vn');
      expect(res.accessToken).toContain('mock-jwt-token-access');
      expect(res.refreshToken).toContain('mock-jwt-token-refresh');
    });

    it('Đăng nhập sai password -> Ném UnauthorizedException (401)', async () => {
      await expect(
        authService.login({ email: 'test@csm.vn', password: 'WrongPassword!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('Đăng nhập email không tồn tại -> Ném UnauthorizedException (401)', async () => {
      await expect(
        authService.login({ email: 'notfound@csm.vn', password: 'CorrectPass123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('Đăng nhập thành công với tài khoản seed cũ sử dụng định dạng hash bcrypt $2b$', async () => {
      // Hash $2b$ được tạo bởi bcrypt native trước đây cho mật khẩu 'Admin@123456'
      mockUsers.push({
        id: 'usr-admin-seed',
        email: 'admin.legacy@csm.vn',
        password_hash: '$2b$10$6AuRHDRVqMnLUM8Xf.AvSevPH3APjkcvcCXkRka3JBE8gB07YA/CW',
        role: UserRole.ADMIN,
        branch_id: null as any,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await authService.login({
        email: 'admin.legacy@csm.vn',
        password: 'Admin@123456',
      });

      expect(res.message).toBe('Đăng nhập thành công');
      expect(res.user.email).toBe('admin.legacy@csm.vn');
      expect(res.user.role).toBe(UserRole.ADMIN);
      expect(res.accessToken).toBeDefined();
    });
  });

  describe('3. Làm mới token (Refresh Token)', () => {
    beforeEach(() => {
      mockUsers.push({
        id: 'usr-01',
        email: 'test@csm.vn',
        password_hash: 'hashed',
        role: UserRole.CUSTOMER,
        branch_id: null as any,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('Refresh với Refresh Token hợp lệ -> Cấp cặp token mới', async () => {
      const res = await authService.refreshToken('valid-refresh-token');
      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
    });

    it('Refresh với Access Token (type claim check) -> Từ chối bằng UnauthorizedException', async () => {
      await expect(
        authService.refreshToken('valid-access-token-wrong-type'),
      ).rejects.toThrow(new UnauthorizedException('Token không phải là refresh token (từ chối access token)'));
    });

    it('Refresh với token không hợp lệ / hết hạn -> Ném UnauthorizedException', async () => {
      await expect(
        authService.refreshToken('invalid-corrupted-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
