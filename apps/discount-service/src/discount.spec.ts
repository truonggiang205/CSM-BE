import { Test, TestingModule } from '@nestjs/testing';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { VoucherUsage, UsageStatus } from './entities/voucher-usage.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';

describe('DiscountService & DiscountController Unit Tests', () => {
  let controller: DiscountController;
  let service: DiscountService;

  // In-memory mock databases
  let mockVouchers: Voucher[] = [];
  let mockUsages: VoucherUsage[] = [];

  const createMockVoucher = (overrides: Partial<Voucher> = {}): Voucher => {
    const now = new Date();
    const nextMonth = new Date(Date.now() + 30 * 86400000);
    const lastMonth = new Date(Date.now() - 30 * 86400000);

    return {
      id: 'v-uuid-001',
      code: 'CSM20K',
      description: 'Giảm 20.000đ',
      discount_type: DiscountType.FIXED_AMOUNT,
      discount_value: 20000,
      min_order_value: 50000,
      max_discount_amount: 50000,
      usage_limit: 100,
      max_usage_per_user: 1,
      used_count: 0,
      start_date: lastMonth,
      end_date: nextMonth,
      is_freeship: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  };

  const mockVoucherRepo = {
    find: jest.fn(async () => mockVouchers),
    findOne: jest.fn(async (opts: any) => {
      const code = opts.where?.code;
      const id = opts.where?.id;
      return mockVouchers.find((v) => (code && v.code === code) || (id && v.id === id)) || null;
    }),
    count: jest.fn(async () => mockVouchers.length),
    save: jest.fn(async (voucher: any) => {
      const idx = mockVouchers.findIndex((v) => v.id === voucher.id || v.code === voucher.code);
      if (idx >= 0) {
        mockVouchers[idx] = { ...mockVouchers[idx], ...voucher };
        return mockVouchers[idx];
      }
      const newV = { id: `v-${Date.now()}`, ...voucher };
      mockVouchers.push(newV);
      return newV;
    }),
    create: jest.fn((dto: any) => ({ ...dto, id: `v-${Date.now()}`, used_count: 0, is_active: true })),
  };

  const mockUsageRepo = {
    find: jest.fn(async (opts: any) => {
      let res = [...mockUsages];
      if (opts?.where?.voucher_id) res = res.filter((u) => u.voucher_id === opts.where.voucher_id);
      if (opts?.where?.user_id) res = res.filter((u) => u.user_id === opts.where.user_id);
      if (opts?.where?.status) res = res.filter((u) => u.status === opts.where.status);
      return res;
    }),
    findOne: jest.fn(async (opts: any) => {
      const where = opts?.where || {};
      return (
        mockUsages.find((u) => {
          let match = true;
          if (where.voucher_id && u.voucher_id !== where.voucher_id) match = false;
          if (where.user_id && u.user_id !== where.user_id) match = false;
          if (where.order_id && u.order_id !== where.order_id) match = false;
          if (where.status && u.status !== where.status) match = false;
          return match;
        }) || null
      );
    }),
    count: jest.fn(async (opts: any) => {
      let res = [...mockUsages];
      if (opts?.where?.voucher_id) res = res.filter((u) => u.voucher_id === opts.where.voucher_id);
      if (opts?.where?.user_id) res = res.filter((u) => u.user_id === opts.where.user_id);
      if (opts?.where?.status) res = res.filter((u) => u.status === opts.where.status);
      return res.length;
    }),
    save: jest.fn(async (usage: any) => {
      const idx = mockUsages.findIndex((u) => u.id === usage.id);
      if (idx >= 0) {
        mockUsages[idx] = { ...mockUsages[idx], ...usage };
        return mockUsages[idx];
      }
      const newU = { id: `u-${Date.now()}`, ...usage };
      mockUsages.push(newU);
      return newU;
    }),
    create: jest.fn((dto: any) => ({ ...dto, id: `u-${Date.now()}`, created_at: new Date() })),
  };

  const mockDataSource = {
    transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
      const mockManager = {
        findOne: jest.fn(async (entity: any, opts: any) => {
          if (entity === VoucherUsage) return mockUsageRepo.findOne(opts);
          if (entity === Voucher) return mockVoucherRepo.findOne(opts);
          return null;
        }),
        count: jest.fn(async (entity: any, opts: any) => {
          if (entity === VoucherUsage) return mockUsageRepo.count(opts);
          return 0;
        }),
        save: jest.fn(async (entity: any) => {
          if ('code' in entity) return mockVoucherRepo.save(entity);
          return mockUsageRepo.save(entity);
        }),
        create: jest.fn((entity: any, dto: any) => {
          if (entity === VoucherUsage) return mockUsageRepo.create(dto);
          return mockVoucherRepo.create(dto);
        }),
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () => mockVouchers[0] || null),
        })),
      };
      return await cb(mockManager);
    }),
  };

  beforeEach(async () => {
    mockVouchers = [createMockVoucher()];
    mockUsages = [];
    jest.clearAllMocks();

    process.env.INTERNAL_SECRET = 'csm-super-secure-internal-secret-token';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscountController],
      providers: [
        DiscountService,
        { provide: getRepositoryToken(Voucher), useValue: mockVoucherRepo },
        { provide: getRepositoryToken(VoucherUsage), useValue: mockUsageRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<DiscountService>(DiscountService);
    controller = module.get<DiscountController>(DiscountController);
  });

  describe('1. Logic tính toán và Validate Voucher (validateVoucher)', () => {
    it('Tính giảm tiền cố định (FIXED_AMOUNT) chính xác', async () => {
      const res = await service.validateVoucher('CSM20K', 100000, 'usr-1');
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(20000);
      expect(res.finalAmount).toBe(80000);
    });

    it('Tính giảm theo phần trăm (PERCENTAGE) có làm tròn và khống chế trần', async () => {
      mockVouchers = [
        createMockVoucher({
          code: 'CSM15PCT',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 15,
          max_discount_amount: 30000,
          min_order_value: 50000,
        }),
      ];

      // Đơn 100.000đ: 15% là 15.000đ (< 30.000đ max)
      const res1 = await service.validateVoucher('CSM15PCT', 100000);
      expect(res1.discountAmount).toBe(15000);
      expect(res1.finalAmount).toBe(85000);

      // Đơn 300.000đ: 15% là 45.000đ -> Chặn ở trần 30.000đ
      const res2 = await service.validateVoucher('CSM15PCT', 300000);
      expect(res2.discountAmount).toBe(30000);
      expect(res2.finalAmount).toBe(270000);
    });

    it('Mã Freeship: mức giảm không vượt quá phí vận chuyển thực tế', async () => {
      mockVouchers = [
        createMockVoucher({
          code: 'FREESHIP15K',
          discount_type: DiscountType.FIXED_AMOUNT,
          discount_value: 15000,
          is_freeship: true,
          min_order_value: 50000,
        }),
      ];

      const res = await service.validateVoucher('FREESHIP15K', 60000, 'usr-1', 15000);
      expect(res.discountAmount).toBe(15000);
    });

    it('Từ chối khi đơn hàng chưa đạt giá trị tối thiểu (min_order_value)', async () => {
      await expect(service.validateVoucher('CSM20K', 30000, 'usr-1')).rejects.toThrow(BadRequestException);
    });

    it('Từ chối khi mã voucher không tồn tại (NotFoundException)', async () => {
      await expect(service.validateVoucher('NON_EXISTENT', 100000)).rejects.toThrow(NotFoundException);
    });

    it('Từ chối khi voucher bị tạm dừng (is_active = false)', async () => {
      mockVouchers[0].is_active = false;
      await expect(service.validateVoucher('CSM20K', 100000)).rejects.toThrow(BadRequestException);
    });

    it('Từ chối khi voucher đã hết hạn sử dụng', async () => {
      mockVouchers[0].end_date = new Date(Date.now() - 3600000); // 1 giờ trước
      await expect(service.validateVoucher('CSM20K', 100000)).rejects.toThrow(BadRequestException);
    });

    it('Từ chối khi voucher đã hết lượt dùng toàn hệ thống (used_count >= usage_limit)', async () => {
      mockVouchers[0].used_count = 100;
      mockVouchers[0].usage_limit = 100;
      await expect(service.validateVoucher('CSM20K', 100000)).rejects.toThrow(BadRequestException);
    });

    it('Từ chối khi user đã dùng hết số lượt cho phép (max_usage_per_user = 1)', async () => {
      mockUsages = [
        {
          id: 'u-1',
          voucher_id: mockVouchers[0].id,
          user_id: 'usr-1',
          order_id: 'order-1',
          status: UsageStatus.USED,
          created_at: new Date(),
          voucher: mockVouchers[0],
        },
      ];
      await expect(service.validateVoucher('CSM20K', 100000, 'usr-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Khóa Giao dịch & Tính Idempotency (claimVoucher & releaseVoucher)', () => {
    it('claimVoucher tăng used_count và tạo bản ghi voucher_usages', async () => {
      await service.claimVoucher('CSM20K', 'usr-1', 'order-101');
      expect(mockVouchers[0].used_count).toBe(1);
      expect(mockUsages.length).toBe(1);
      expect(mockUsages[0].status).toBe(UsageStatus.USED);
    });

    it('claimVoucher đạt tính Idempotent: gọi 2 lần cho cùng 1 đơn không bị trừ 2 lượt', async () => {
      await service.claimVoucher('CSM20K', 'usr-1', 'order-duplicate');
      expect(mockVouchers[0].used_count).toBe(1);

      // Gọi lại lần 2 với cùng orderId
      await service.claimVoucher('CSM20K', 'usr-1', 'order-duplicate');
      expect(mockVouchers[0].used_count).toBe(1); // Vẫn là 1, không tăng thành 2!
    });

    it('releaseVoucher hoàn lại lượt và chuyển status thành REFUNDED', async () => {
      // Giả lập voucher đã được claim bởi order-201
      mockVouchers[0].used_count = 1;
      mockUsages = [
        {
          id: 'u-201',
          voucher_id: mockVouchers[0].id,
          user_id: 'usr-1',
          order_id: 'order-201',
          status: UsageStatus.USED,
          created_at: new Date(),
          voucher: mockVouchers[0],
        },
      ];

      const res = await service.releaseVoucher('CSM20K', 'usr-1', 'order-201');
      expect(res.success).toBe(true);
      expect(mockVouchers[0].used_count).toBe(0);
      expect(mockUsages[0].status).toBe(UsageStatus.REFUNDED);
    });

    it('releaseVoucher đạt tính Idempotent: gọi lặp nhiều lần cho cùng 1 đơn không trừ used_count về âm', async () => {
      mockVouchers[0].used_count = 1;
      mockUsages = [
        {
          id: 'u-202',
          voucher_id: mockVouchers[0].id,
          user_id: 'usr-1',
          order_id: 'order-202',
          status: UsageStatus.USED,
          created_at: new Date(),
          voucher: mockVouchers[0],
        },
      ];

      // Lần 1: hoàn thành công
      await service.releaseVoucher('CSM20K', 'usr-1', 'order-202');
      expect(mockVouchers[0].used_count).toBe(0);

      // Lần 2: gọi lại không trừ tiếp
      await service.releaseVoucher('CSM20K', 'usr-1', 'order-202');
      expect(mockVouchers[0].used_count).toBe(0); // Không bị -1!
    });
  });

  describe('3. Phân quyền và Bảo mật (DiscountController Authorization)', () => {
    it('CUSTOMER gọi tạo voucher (POST /vouchers) -> Bị chặn 403 Forbidden', async () => {
      const mockReq = { headers: { 'x-user-role': 'CUSTOMER' } };
      await expect(
        controller.createVoucher(
          {
            code: 'HACK',
            discount_type: DiscountType.FIXED_AMOUNT,
            discount_value: 50000,
            start_date: new Date().toISOString(),
            end_date: new Date().toISOString(),
          },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN gọi tạo voucher (POST /vouchers) -> Cho phép 201 Created', async () => {
      const mockReq = { headers: { 'x-user-role': 'ADMIN' } };
      const res = await controller.createVoucher(
        {
          code: 'ADMINNEW',
          discount_type: DiscountType.FIXED_AMOUNT,
          discount_value: 30000,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 86400000).toISOString(),
        },
        mockReq,
      );
      expect(res.code).toBe('ADMINNEW');
    });

    it('CUSTOMER gọi bật/tắt voucher (PATCH /vouchers/:id/toggle) -> Bị chặn 403 Forbidden', async () => {
      const mockReq = { headers: { 'x-user-role': 'CUSTOMER' } };
      await expect(controller.toggleVoucher('v-uuid-001', mockReq)).rejects.toThrow(ForbiddenException);
    });

    it('CUSTOMER gọi xem toàn bộ voucher (?all=true) -> Bị chặn 403 Forbidden', async () => {
      const mockReq = { headers: { 'x-user-role': 'CUSTOMER' } };
      await expect(controller.getVouchers('true', undefined, mockReq)).rejects.toThrow(ForbiddenException);
    });

    it('CUSTOMER gọi xem lịch sử sử dụng (/vouchers/:id/usages) -> Bị chặn 403 Forbidden', async () => {
      const mockReq = { headers: { 'x-user-role': 'CUSTOMER' } };
      await expect(controller.getVoucherUsages('v-uuid-001', mockReq)).rejects.toThrow(ForbiddenException);
    });

    it('Client ngoài gọi claimVoucher không có secret -> Bị chặn 403 Forbidden', async () => {
      const mockReq = { headers: {} };
      await expect(controller.claimVoucher('CSM20K', 'usr-1', 'order-1', mockReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Cuộc gọi nội bộ mang x-internal-secret gọi claimVoucher -> Cho phép', async () => {
      const mockReq = { headers: { 'x-internal-secret': 'csm-super-secure-internal-secret-token' } };
      const res = await controller.claimVoucher('CSM20K', 'usr-1', 'order-internal', mockReq);
      expect(res).toBeDefined();
    });
  });
});
