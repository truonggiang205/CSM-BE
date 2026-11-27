import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, UserRole } from './entities/user.entity';

describe('Auth Service Flow Test (Register / Login / Refresh)', () => {
  let authService: AuthService;
  let userRepository: any;
  let jwtService: any;

  const mockUsers: Array<Partial<User> & { id: string; email: string; password_hash: string }> = [];

  beforeEach(async () => {
    mockUsers.length = 0;
    process.env.JWT_SECRET = 'unit-test-jwt-secret-key-min-32-chars!!';
    process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret-key-min-32-chars';

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
        const idx = mockUsers.findIndex((u) => u.id === user.id);
        if (idx >= 0) mockUsers[idx] = user;
        else mockUsers.push(user);
        return user;
      }),
      find: jest.fn().mockImplementation(async () => mockUsers),
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
      // Họ tên được LƯU vào DB (trước đây bị bỏ mất)
      expect(savedInDb?.full_name).toBe('Khách Hàng Mới');
      expect((res.user as any).password_hash).toBeUndefined();
    });

    it('Đăng ký có SĐT -> Chuẩn hoá và lưu SĐT', async () => {
      const res = await authService.register({
        email: 'phone@csm.vn',
        password: 'Password123!',
        phone: '090 123 4567',
      });
      expect(res.user.phone).toBe('0901234567');
    });

    it('Đăng ký với SĐT sai định dạng -> Ném BadRequestException (400)', async () => {
      await expect(
        authService.register({ email: 'badphone@csm.vn', password: 'Password123!', phone: '12345' }),
      ).rejects.toThrow(BadRequestException);
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

  describe('4. Hồ sơ cá nhân (Profile / Đổi mật khẩu)', () => {
    beforeEach(async () => {
      const password_hash = await bcrypt.hash('OldPass123!', 10);
      mockUsers.push({
        id: 'usr-01',
        email: 'test@csm.vn',
        password_hash,
        role: UserRole.CUSTOMER,
        branch_id: null as any,
        full_name: null,
        phone: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('Lấy hồ sơ -> có fullName (mặc định lấy từ email) và không lộ password_hash', async () => {
      const profile = await authService.getProfile('usr-01');
      expect(profile.fullName).toBe('test');
      expect(profile.phone).toBeNull();
      expect((profile as any).password_hash).toBeUndefined();
    });

    it('Cập nhật họ tên + SĐT -> lưu lại và trả về hồ sơ mới', async () => {
      const res = await authService.updateProfile('usr-01', {
        fullName: '  Nguyễn   Văn A ',
        phone: '+84901234567',
      });
      expect(res.user.fullName).toBe('Nguyễn Văn A');
      expect(res.user.phone).toBe('+84901234567');
      expect(mockUsers[0].full_name).toBe('Nguyễn Văn A');
    });

    it('Cập nhật SĐT rỗng -> xoá SĐT', async () => {
      mockUsers[0].phone = '0901234567';
      const res = await authService.updateProfile('usr-01', { phone: '' });
      expect(res.user.phone).toBeNull();
    });

    it('Cập nhật họ tên quá ngắn hoặc SĐT sai -> BadRequestException', async () => {
      await expect(authService.updateProfile('usr-01', { fullName: ' a ' })).rejects.toThrow(BadRequestException);
      await expect(authService.updateProfile('usr-01', { phone: 'abc' })).rejects.toThrow(BadRequestException);
    });

    it('Đổi mật khẩu đúng mật khẩu cũ -> mật khẩu mới dùng để đăng nhập được', async () => {
      const res = await authService.changePassword('usr-01', {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!',
      });
      expect(res.message).toBe('Đổi mật khẩu thành công');
      const login = await authService.login({ email: 'test@csm.vn', password: 'NewPass456!' });
      expect(login.accessToken).toBeDefined();
    });

    it('Đổi mật khẩu sai mật khẩu cũ / trùng mật khẩu cũ -> BadRequestException', async () => {
      await expect(
        authService.changePassword('usr-01', { currentPassword: 'Wrong!', newPassword: 'NewPass456!' }),
      ).rejects.toThrow(new BadRequestException('Mật khẩu hiện tại không chính xác'));
      await expect(
        authService.changePassword('usr-01', { currentPassword: 'OldPass123!', newPassword: 'OldPass123!' }),
      ).rejects.toThrow(new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại'));
    });

    it('Khách hàng gọi danh sách người dùng -> ForbiddenException; Admin thì được', async () => {
      await expect(authService.getUsers(UserRole.CUSTOMER)).rejects.toThrow(ForbiddenException);
      await expect(authService.getUsers(UserRole.ADMIN)).resolves.toHaveLength(1);
    });
  });
});
