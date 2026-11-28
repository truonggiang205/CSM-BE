import { Test, TestingModule } from '@nestjs/testing';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { VoucherUsage, UsageStatus } from './entities/voucher-usage.entity';
import { FlashSaleCampaign } from './entities/flash-sale-campaign.entity';
import { FlashSaleItem, FlashSaleDiscountType } from './entities/flash-sale-item.entity';
import { Combo } from './entities/combo.entity';
import { ComboItem } from './entities/combo-item.entity';
import { SpinHistory } from './entities/spin-history.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import axios from 'axios';
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
    delete: jest.fn(async (id: string) => {
      mockVouchers = mockVouchers.filter((v) => v.id !== id);
      return { affected: 1 };
    }),
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
          getMany: jest.fn(async () => mockUsages.filter((u: any) => u.status === 'USED')),
        })),
      };
      return await cb(mockManager);
    }),
  };

  // Repository giả cho các bảng Flash Sale / Combo / Spin (chỉ cần những hàm được gọi trong test)
  const mockSimpleRepo = () => ({
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (entity: any) => entity),
    remove: jest.fn(async (entity: any) => entity),
    count: jest.fn(async () => 0),
  });
  const mockCampaignRepo = mockSimpleRepo();
  const mockFlashItemRepo = mockSimpleRepo();

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
        { provide: getRepositoryToken(FlashSaleCampaign), useValue: mockCampaignRepo },
        { provide: getRepositoryToken(FlashSaleItem), useValue: mockFlashItemRepo },
        { provide: getRepositoryToken(Combo), useValue: mockSimpleRepo() },
        { provide: getRepositoryToken(ComboItem), useValue: mockSimpleRepo() },
        { provide: getRepositoryToken(SpinHistory), useValue: mockSimpleRepo() },
      ],
    }).compile();

    service = module.get<DiscountService>(DiscountService);
    controller = module.get<DiscountController>(DiscountController);
  });

  describe('3d. Kiểm tra dữ liệu khi tạo combo (FE#28)', () => {
    const baseCombo = {
      name: 'Combo Bữa Sáng',
      combo_price: 30000,
      items: [
        { product_id: 'p1', product_name: 'Bánh mì', original_price: 20000, quantity: 1 },
        { product_id: 'p2', product_name: 'Cà phê', original_price: 20000, quantity: 1 },
      ],
    };

    it('Bỏ trống giá bán hoặc giá 0đ / dưới 1.000đ -> bị chặn', async () => {
      await expect(service.createCombo({ ...baseCombo, combo_price: undefined } as any)).rejects.toThrow(
        'Vui lòng nhập giá bán',
      );
      await expect(service.createCombo({ ...baseCombo, combo_price: 0 })).rejects.toThrow('từ 1.000đ');
      await expect(service.createCombo({ ...baseCombo, combo_price: 500 })).rejects.toThrow('từ 1.000đ');
    });

    it('URL ảnh nhập bừa -> bị chặn; URL https hoặc /uploads hợp lệ', async () => {
      await expect(service.createCombo({ ...baseCombo, image_url: 'abc xyz' })).rejects.toThrow('URL ảnh');
      await expect(
        service.createCombo({ ...baseCombo, image_url: 'https://cdn.example.com/a.jpg' }),
      ).resolves.toBeDefined();
      await expect(service.createCombo({ ...baseCombo, image_url: '/uploads/abc.jpg' })).resolves.toBeDefined();
    });

    it('Món trùng, số lượng món quá lớn, tên quá ngắn -> bị chặn', async () => {
      await expect(
        service.createCombo({ ...baseCombo, items: [baseCombo.items[0], baseCombo.items[0]] }),
      ).rejects.toThrow('một lần');
      await expect(
        service.createCombo({ ...baseCombo, items: [{ ...baseCombo.items[0], quantity: 100 }, baseCombo.items[1]] }),
      ).rejects.toThrow('1 đến 99');
      await expect(service.createCombo({ ...baseCombo, name: 'AB' })).rejects.toThrow('3 đến 100');
    });
  });

  describe('3e. Kiểm tra tồn kho khi tạo combo (FE#30, FE#31)', () => {
    const combo = {
      name: 'Combo Ăn Trưa',
      combo_price: 30000,
      items: [
        { product_id: 'p-com', product_name: 'Cơm hộp', original_price: 25000, quantity: 2 },
        { product_id: 'p-nuoc', product_name: 'Nước suối', original_price: 10000, quantity: 1 },
      ],
    };
    const stockOf: Record<string, Array<{ branch_id: string; available: number }>> = {};

    beforeEach(() => {
      jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
        const id = decodeURIComponent(String(url).split('/inventory/product/')[1] || '');
        return { data: stockOf[id] || [] } as any;
      });
    });
    afterEach(() => jest.restoreAllMocks());

    it('Món hết hàng ở mọi chi nhánh -> không tạo được combo', async () => {
      stockOf['p-com'] = [{ branch_id: 'br-01', available: 0 }];
      stockOf['p-nuoc'] = [{ branch_id: 'br-01', available: 10 }];
      await expect(service.createCombo(combo)).rejects.toThrow('Cơm hộp" đã hết hàng');
    });

    it('Số lượng mỗi suất vượt tồn kho lớn nhất của 1 chi nhánh -> bị chặn (tổng nhiều chi nhánh không tính)', async () => {
      stockOf['p-com'] = [
        { branch_id: 'br-01', available: 1 },
        { branch_id: 'br-02', available: 1 },
      ];
      stockOf['p-nuoc'] = [{ branch_id: 'br-01', available: 10 }];
      await expect(service.createCombo(combo)).rejects.toThrow('chỉ còn tối đa 1');
    });

    it('Đủ hàng ở ít nhất 1 chi nhánh -> tạo được combo', async () => {
      stockOf['p-com'] = [{ branch_id: 'br-02', available: 5 }];
      stockOf['p-nuoc'] = [{ branch_id: 'br-02', available: 3 }];
      await expect(service.createCombo(combo)).resolves.toBeDefined();
    });
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
      await expect(service.validateVoucher('CSM20K', 100000, 'usr-1')).rejects.toThrow(BadRequestException);
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

    it('FE#46: khách dùng hết lượt, huỷ đơn -> mã được hoàn và khách dùng lại được', async () => {
      // Voucher mỗi khách chỉ dùng 1 lượt
      mockVouchers[0].used_count = 0;
      mockVouchers[0].max_usage_per_user = 1;
      mockUsages = [];

      await service.claimVoucher('CSM20K', 'usr-46', 'order-46a');
      await expect(service.validateVoucher('CSM20K', 100000, 'usr-46')).rejects.toThrow('hết lượt');

      await service.releaseVoucher('CSM20K', 'usr-46', 'order-46a');

      const again = await service.validateVoucher('CSM20K', 100000, 'usr-46');
      expect(again.valid).toBe(true);
      const publicList = await service.getPublicVouchers('usr-46');
      expect(publicList.map((v) => v.code)).toContain('CSM20K');
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
          min_order_value: 50000,
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

  describe('3b. Quản lý voucher: sửa, xoá, quy tắc bật/tắt (FE#44)', () => {
    const admin = { headers: { 'x-user-role': 'ADMIN' } };

    it('Không cho bật/tắt voucher đã kết thúc hoặc chưa bắt đầu', async () => {
      mockVouchers = [
        createMockVoucher({ id: 'v-ended', code: 'ENDED', end_date: new Date(Date.now() - 1000) }),
        createMockVoucher({ id: 'v-soon', code: 'SOON', start_date: new Date(Date.now() + 3600000) }),
      ];
      await expect(service.toggleVoucher('v-ended')).rejects.toThrow('đã kết thúc');
      await expect(service.toggleVoucher('v-soon')).rejects.toThrow('chưa đến thời gian bắt đầu');
    });

    it('Không cho bật lại voucher đã hết lượt dùng', async () => {
      mockVouchers = [createMockVoucher({ usage_limit: 5, used_count: 5 })];
      await expect(service.toggleVoucher('v-uuid-001')).rejects.toThrow('hết lượt dùng');
    });

    it('Sửa voucher chưa dùng: đổi được mức giảm và thời gian', async () => {
      mockVouchers = [createMockVoucher()];
      const res = await controller.updateVoucher(
        'v-uuid-001',
        { discount_value: 15000, end_date: new Date(Date.now() + 5 * 86400000).toISOString() },
        admin,
      );
      expect(Number(res.discount_value)).toBe(15000);
    });

    it('Sửa voucher đã có lượt dùng: chặn đổi mức giảm, chặn tổng lượt < đã dùng', async () => {
      mockVouchers = [createMockVoucher({ used_count: 3 })];
      await expect(service.updateVoucher('v-uuid-001', { discount_value: 1000 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateVoucher('v-uuid-001', { usage_limit: 2 })).rejects.toThrow('không được nhỏ hơn');
      const ok = await service.updateVoucher('v-uuid-001', { description: 'Mô tả mới' });
      expect(ok.description).toBe('Mô tả mới');
    });

    it('Xoá voucher: chặn khi còn đơn đang dùng, cho xoá khi chưa dùng; CUSTOMER bị 403', async () => {
      mockVouchers = [createMockVoucher()];
      mockUsages = [
        { id: 'u-1', voucher_id: 'v-uuid-001', user_id: 'usr', order_id: 'o-1', status: UsageStatus.USED } as any,
      ];
      await expect(service.deleteVoucher('v-uuid-001')).rejects.toThrow('không thể xoá');
      mockUsages = [];
      await expect(
        controller.deleteVoucher('v-uuid-001', { headers: { 'x-user-role': 'CUSTOMER' } }),
      ).rejects.toThrow(ForbiddenException);
      const res = await controller.deleteVoucher('v-uuid-001', admin);
      expect(res.success).toBe(true);
      expect(mockVouchers).toHaveLength(0);
    });
  });

  describe('3c. Kiểm tra dữ liệu khi tạo voucher (FE#45)', () => {
    const future = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
    const base = {
      code: 'NEWCODE',
      discount_type: DiscountType.FIXED_AMOUNT,
      discount_value: 20000,
      min_order_value: 50000,
      usage_limit: 100,
      start_date: future(1),
      end_date: future(48),
    };

    beforeEach(() => {
      mockVouchers = [];
    });

    it('Chặn mức giảm tiền mặt dưới 1.000đ (VD: 14đ)', async () => {
      await expect(service.createVoucher({ ...base, discount_value: 14 })).rejects.toThrow('từ 1.000đ');
    });

    it('Chặn mức giảm lớn hơn đơn tối thiểu (VD: giảm 20.000.000đ cho đơn 50.000đ, hoặc đơn 0đ)', async () => {
      await expect(service.createVoucher({ ...base, discount_value: 20_000_000 })).rejects.toThrow(
        'không được lớn hơn đơn tối thiểu',
      );
      await expect(service.createVoucher({ ...base, min_order_value: 0 })).rejects.toThrow(
        'không được lớn hơn đơn tối thiểu',
      );
    });

    it('Đơn tối thiểu phải bằng 0 hoặc từ 1.000đ; voucher % phải có giảm tối đa', async () => {
      await expect(service.createVoucher({ ...base, discount_value: 100, min_order_value: 500 })).rejects.toThrow(
        'Đơn tối thiểu',
      );
      await expect(
        service.createVoucher({ ...base, discount_type: DiscountType.PERCENTAGE, discount_value: 10 }),
      ).rejects.toThrow('giảm tối đa');
    });

    it('Chặn thời gian bắt đầu ở quá khứ và kết thúc trước bắt đầu', async () => {
      await expect(
        service.createVoucher({ ...base, start_date: new Date(Date.now() - 3600000).toISOString() }),
      ).rejects.toThrow('quá khứ');
      await expect(service.createVoucher({ ...base, end_date: future(0.5) })).rejects.toThrow(
        'sau thời gian bắt đầu',
      );
    });

    it('Chặn mã sai định dạng; dữ liệu hợp lệ thì tạo được', async () => {
      await expect(service.createVoucher({ ...base, code: 'AB' })).rejects.toThrow('3 đến 20 ký tự');
      const ok = await service.createVoucher(base);
      expect(ok.code).toBe('NEWCODE');
    });
  });

  describe('4. Flash Sale: chọn kiểu giảm % hoặc tiền mặt & phân quyền', () => {
    const baseDto = (item: any) => ({
      name: 'Giờ vàng test',
      start_date: '2099-01-01',
      end_date: '2099-01-01',
      start_time: '10:00:00',
      end_time: '12:00:00',
      is_active: false,
      items: [{ product_id: 'p1', product_name: 'Mì ly', original_price: 20000, ...item }],
    });

    it('Giảm theo % -> server tự tính giá sale', async () => {
      const res: any = await service.createFlashSale(
        baseDto({ discount_type: FlashSaleDiscountType.PERCENT, discount_value: 25 }) as any,
      );
      expect(res.items[0]).toMatchObject({
        sale_price: 15000,
        discount_percentage: 25,
        discount_type: FlashSaleDiscountType.PERCENT,
        discount_value: 25,
      });
    });

    it('Giảm tiền mặt -> giá sale = giá gốc - số tiền giảm', async () => {
      const res: any = await service.createFlashSale(
        baseDto({ discount_type: FlashSaleDiscountType.FIXED_AMOUNT, discount_value: 5000 }) as any,
      );
      expect(res.items[0]).toMatchObject({
        sale_price: 15000,
        discount_percentage: 25,
        discount_type: FlashSaleDiscountType.FIXED_AMOUNT,
        discount_value: 5000,
      });
    });

    it('today-deals trả về cả món của ca SẮP DIỄN RA', async () => {
      mockCampaignRepo.find.mockResolvedValueOnce([
        {
          id: 'fs-up',
          name: 'Ca tối',
          start_date: '2099-01-01',
          end_date: '2099-01-01',
          start_time: '18:00:00',
          end_time: '20:00:00',
          is_active: true,
          items: [
            { id: 'i1', product_id: 'p1', product_name: 'Mì ly', original_price: 10000, sale_price: 8000, quantity_limit: 10, sold_count: 0, max_per_user: 2 },
          ],
        },
      ] as any);
      const res: any = await service.getTodayDeals();
      expect(res.flashSale.status).toBe('UPCOMING');
      expect(res.deals).toHaveLength(1);
      expect(res.deals[0]).toMatchObject({ product_id: 'p1', status: 'UPCOMING' });
    });

    it('Dữ liệu cũ chỉ gửi sale_price -> vẫn hoạt động, coi như giảm %', async () => {
      const res: any = await service.createFlashSale(baseDto({ sale_price: 16000 }) as any);
      expect(res.items[0]).toMatchObject({ sale_price: 16000, discount_percentage: 20, discount_type: 'PERCENT' });
    });

    it('Giảm tiền mặt >= giá gốc -> Bị từ chối', async () => {
      await expect(
        service.createFlashSale(
          baseDto({ discount_type: FlashSaleDiscountType.FIXED_AMOUNT, discount_value: 20000 }) as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Giảm % ngoài khoảng 1-99 -> Bị từ chối', async () => {
      await expect(
        service.createFlashSale(baseDto({ discount_type: FlashSaleDiscountType.PERCENT, discount_value: 100 }) as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('CUSTOMER tạo Flash Sale hoặc Combo -> Bị chặn 403', () => {
      const req = { headers: { 'x-user-role': 'CUSTOMER' } };
      expect(() => controller.createFlashSale(baseDto({ sale_price: 1 }) as any, req)).toThrow(ForbiddenException);
      expect(() => controller.deleteCombo('c1', req)).toThrow(ForbiddenException);
    });

    it('Client ngoài gọi record-purchase không có secret -> Bị chặn 403', () => {
      expect(() =>
        controller.recordFlashSalePurchases([{ productId: 'p1', quantity: 1 }], { headers: {} }),
      ).toThrow(ForbiddenException);
    });
  });
});
