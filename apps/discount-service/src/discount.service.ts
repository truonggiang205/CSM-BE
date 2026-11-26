import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
import axios from 'axios';
import { Voucher, DiscountType } from './entities/voucher.entity';
import { VoucherUsage, UsageStatus } from './entities/voucher-usage.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { FlashSaleCampaign } from './entities/flash-sale-campaign.entity';
import { FlashSaleItem } from './entities/flash-sale-item.entity';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto';
import { Combo } from './entities/combo.entity';
import { ComboItem } from './entities/combo-item.entity';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { SpinHistory } from './entities/spin-history.entity';

@Injectable()
export class DiscountService implements OnModuleInit {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherUsage)
    private readonly usageRepo: Repository<VoucherUsage>,
    private readonly dataSource: DataSource,
    @InjectRepository(FlashSaleCampaign)
    private readonly campaignRepo: Repository<FlashSaleCampaign>,
    @InjectRepository(FlashSaleItem)
    private readonly itemRepo: Repository<FlashSaleItem>,
    @InjectRepository(Combo)
    private readonly comboRepo: Repository<Combo>,
    @InjectRepository(ComboItem)
    private readonly comboItemRepo: Repository<ComboItem>,
    @InjectRepository(SpinHistory)
    private readonly spinHistoryRepo: Repository<SpinHistory>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.voucherRepo.count();
      if (count === 0) {
        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);

        await this.voucherRepo.save([
          {
            code: 'CSM20K',
            description: 'Giảm 20.000đ cho đơn hàng từ 100.000đ',
            discount_type: DiscountType.FIXED_AMOUNT,
            discount_value: 20000,
            min_order_value: 100000,
            usage_limit: 1000,
            max_usage_per_user: 1,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
          {
            code: 'CSM10PCT',
            description: 'Giảm 10% (tối đa 50.000đ) cho đơn hàng từ 150.000đ',
            discount_type: DiscountType.PERCENTAGE,
            discount_value: 10,
            max_discount_amount: 50000,
            min_order_value: 150000,
            usage_limit: 500,
            max_usage_per_user: 1,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
          {
            code: 'CSMFREESHIP',
            description: 'Hỗ trợ 15.000đ phí vận chuyển cho đơn từ 50.000đ',
            discount_type: DiscountType.FIXED_AMOUNT,
            discount_value: 15000,
            min_order_value: 50000,
            usage_limit: 2000,
            max_usage_per_user: 1,
            is_freeship: true,
            used_count: 0,
            start_date: now,
            end_date: nextYear,
            is_active: true,
          },
        ]);
      }

      const campaignCount = await this.campaignRepo.count();
      if (campaignCount === 0) {
        const campaign = this.campaignRepo.create({
          name: 'Giờ Vàng Giảm Giá CSM - Hôm Nay',
          start_time: '06:00:00',
          end_time: '23:59:59',
          is_active: true,
          items: [
            this.itemRepo.create({
              product_id: 'p2',
              product_name: 'Bánh mì kẹp thịt nguội',
              original_price: 25000,
              sale_price: 19000,
              discount_percentage: 24,
              quantity_limit: 100,
              sold_count: 38,
              max_per_user: 2,
            }),
            this.itemRepo.create({
              product_id: 'p5',
              product_name: 'Cà phê sữa đá pha sẵn',
              original_price: 18000,
              sale_price: 14000,
              discount_percentage: 22,
              quantity_limit: 80,
              sold_count: 42,
              max_per_user: 2,
            }),
            this.itemRepo.create({
              product_id: 'p4',
              product_name: 'Mì ly Modern chua cay',
              original_price: 9000,
              sale_price: 7000,
              discount_percentage: 22,
              quantity_limit: 150,
              sold_count: 89,
              max_per_user: 3,
            }),
            this.itemRepo.create({
              product_id: 'p3',
              product_name: "Snack khoai tây O'Star",
              original_price: 12000,
              sale_price: 9000,
              discount_percentage: 25,
              quantity_limit: 120,
              sold_count: 55,
              max_per_user: 2,
            }),
          ],
        });
        await this.campaignRepo.save(campaign);
      }

      await this.seedAndSyncCombosAndGifts();
    } catch {}
  }

  private async fetchRealProducts(): Promise<
    Array<{ id: string; name: string; base_price: number; image_url?: string }>
  > {
    try {
      const baseUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
      const res = await axios.get(`${baseUrl}/products`, {
        params: { page: 1, limit: 100 },
        timeout: 3000,
      });
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
            ? raw.data
            : [];
      return list
        .filter((p: any) => p && p.id)
        .map((p: any) => ({
          id: String(p.id),
          name: String(p.name || 'Sản phẩm'),
          base_price: Number(p.base_price) || 0,
          image_url: p.image_url || undefined,
        }));
    } catch {
      return [];
    }
  }

  private pickProductByKeyword(
    products: Array<{ id: string; name: string; base_price: number; image_url?: string }>,
    keywords: string[],
    fallbackIdx: number,
  ) {
    for (const kw of keywords) {
      const found = products.find((p) => p.name.toLowerCase().includes(kw));
      if (found) return found;
    }
    return products[fallbackIdx % products.length];
  }

  private async seedAndSyncCombosAndGifts() {
    const realProducts = await this.fetchRealProducts();
    if (realProducts.length < 2) return;

    const pWater = this.pickProductByKeyword(realProducts, ['nước khoáng', 'lavie', 'nước'], 0);
    const pBread = this.pickProductByKeyword(realProducts, ['bánh mì', 'sandwich', 'bánh'], 1);
    const pSnack = this.pickProductByKeyword(realProducts, ['snack', 'khoai tây', 'bắp'], 2);
    const pNoodle = this.pickProductByKeyword(realProducts, ['mì ly', 'mì', 'xúc xích'], 3);
    const pCoffee = this.pickProductByKeyword(realProducts, ['cà phê', 'trà sữa', 'trà'], 4);

    const legacyMap: Record<string, typeof pWater> = {
      p1: pWater,
      p2: pBread,
      p3: pSnack,
      p4: pNoodle,
      p5: pCoffee,
    };

    const comboCount = await this.comboRepo.count();
    if (comboCount === 0) {
      const now = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(now.getFullYear() + 1);

      const orig1 = pBread.base_price + pCoffee.base_price + pSnack.base_price;
      const orig2 = pNoodle.base_price + pWater.base_price + pSnack.base_price;
      const orig3 = pNoodle.base_price * 2 + pCoffee.base_price;

      await this.comboRepo.save([
        this.comboRepo.create({
          name: 'Combo Bữa Sáng Năng Lượng',
          description: `${pBread.name} kèm ${pCoffee.name} và ${pSnack.name}`,
          original_price: orig1,
          combo_price: Math.max(1000, Math.round((orig1 * 0.78) / 1000) * 1000),
          start_date: now,
          end_date: nextYear,
          is_active: true,
          items: [
            this.comboItemRepo.create({
              product_id: pBread.id,
              product_name: pBread.name,
              product_image: pBread.image_url || null,
              original_price: pBread.base_price,
              quantity: 1,
            }),
            this.comboItemRepo.create({
              product_id: pCoffee.id,
              product_name: pCoffee.name,
              product_image: pCoffee.image_url || null,
              original_price: pCoffee.base_price,
              quantity: 1,
            }),
            this.comboItemRepo.create({
              product_id: pSnack.id,
              product_name: pSnack.name,
              product_image: pSnack.image_url || null,
              original_price: pSnack.base_price,
              quantity: 1,
            }),
          ],
        }),
        this.comboRepo.create({
          name: 'Combo Bữa Trưa Tiện Lợi',
          description: `${pNoodle.name}, ${pWater.name} và ${pSnack.name}`,
          original_price: orig2,
          combo_price: Math.max(1000, Math.round((orig2 * 0.78) / 1000) * 1000),
          start_date: now,
          end_date: nextYear,
          is_active: true,
          items: [
            this.comboItemRepo.create({
              product_id: pNoodle.id,
              product_name: pNoodle.name,
              product_image: pNoodle.image_url || null,
              original_price: pNoodle.base_price,
              quantity: 1,
            }),
            this.comboItemRepo.create({
              product_id: pWater.id,
              product_name: pWater.name,
              product_image: pWater.image_url || null,
              original_price: pWater.base_price,
              quantity: 1,
            }),
            this.comboItemRepo.create({
              product_id: pSnack.id,
              product_name: pSnack.name,
              product_image: pSnack.image_url || null,
              original_price: pSnack.base_price,
              quantity: 1,
            }),
          ],
        }),
        this.comboRepo.create({
          name: 'Combo Cú Đêm No Nê',
          description: `2 ${pNoodle.name} kèm ${pCoffee.name} tỉnh táo xuyên đêm`,
          original_price: orig3,
          combo_price: Math.max(1000, Math.round((orig3 * 0.75) / 1000) * 1000),
          start_date: now,
          end_date: nextYear,
          is_active: true,
          items: [
            this.comboItemRepo.create({
              product_id: pNoodle.id,
              product_name: pNoodle.name,
              product_image: pNoodle.image_url || null,
              original_price: pNoodle.base_price,
              quantity: 2,
            }),
            this.comboItemRepo.create({
              product_id: pCoffee.id,
              product_name: pCoffee.name,
              product_image: pCoffee.image_url || null,
              original_price: pCoffee.base_price,
              quantity: 1,
            }),
          ],
        }),
      ]);
    } else {
      // Tự động sửa các combo_items cũ đang dùng ID giả p1..p5 sang UUID thật
      const allComboItems = await this.comboItemRepo.find();
      for (const ci of allComboItems) {
        const mapped = legacyMap[ci.product_id];
        if (mapped) {
          ci.product_id = mapped.id;
          ci.product_name = mapped.name;
          ci.product_image = mapped.image_url || ci.product_image || null;
          ci.original_price = mapped.base_price;
          await this.comboItemRepo.save(ci);
        }
      }
    }
  }

  async getPublicVouchers(userId?: string) {
    const now = new Date();
    const vouchers = await this.voucherRepo.find({
      where: {
        is_active: true,
        start_date: LessThanOrEqual(now),
        end_date: MoreThanOrEqual(now),
      },
      order: { created_at: 'DESC' },
    });

    if (!userId) {
      return vouchers.filter((v) => v.used_count < v.usage_limit);
    }

    const userUsages = await this.usageRepo.find({
      where: { user_id: userId, status: UsageStatus.USED },
    });

    const userUsageCountMap = new Map<string, number>();
    for (const u of userUsages) {
      const current = userUsageCountMap.get(u.voucher_id) || 0;
      userUsageCountMap.set(u.voucher_id, current + 1);
    }

    return vouchers.filter((v) => {
      if (v.used_count >= v.usage_limit) return false;
      const userUsed = userUsageCountMap.get(v.id) || 0;
      if (userUsed >= v.max_usage_per_user) return false;
      return true;
    });
  }

  async getAllVouchers() {
    return this.voucherRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  async getVoucherUsages(voucherId: string) {
    return this.usageRepo.find({
      where: { voucher_id: voucherId },
      order: { created_at: 'DESC' },
    });
  }

  async validateVoucher(
    code: string,
    orderValue: number,
    userId?: string,
    shippingFee: number = 0,
  ) {
    const normalizedCode = code.trim().toUpperCase();
    const voucher = await this.voucherRepo.findOne({ where: { code: normalizedCode } });

    if (!voucher) {
      throw new NotFoundException(`Mã giảm giá '${normalizedCode}' không tồn tại.`);
    }

    if (!voucher.is_active) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' hiện đang tạm khóa.`);
    }

    const now = new Date();
    if (now < voucher.start_date) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' chưa tới ngày áp dụng.`);
    }

    if (now > voucher.end_date) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết hạn.`);
    }

    if (voucher.used_count >= voucher.usage_limit) {
      throw new BadRequestException(`Mã giảm giá '${normalizedCode}' đã hết lượt sử dụng.`);
    }

    if (orderValue < Number(voucher.min_order_value)) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${Number(voucher.min_order_value).toLocaleString('vi-VN')}đ để sử dụng mã này.`,
      );
    }

    if (userId) {
      const userUsageCount = await this.usageRepo.count({
        where: {
          voucher_id: voucher.id,
          user_id: userId,
          status: UsageStatus.USED,
        },
      });

      if (userUsageCount >= voucher.max_usage_per_user) {
        throw new BadRequestException(
          `Bạn đã sử dụng hết lượt cho phép (${voucher.max_usage_per_user} lần) của mã '${normalizedCode}'.`,
        );
      }
    }

    let discountAmount = 0;
    if (voucher.is_freeship) {
      discountAmount = Math.min(Number(voucher.discount_value), Number(shippingFee));
    } else if (voucher.discount_type === DiscountType.FIXED_AMOUNT) {
      discountAmount = Number(voucher.discount_value);
    } else if (voucher.discount_type === DiscountType.PERCENTAGE) {
      discountAmount = (orderValue * Number(voucher.discount_value)) / 100;
      if (voucher.max_discount_amount) {
        discountAmount = Math.min(discountAmount, Number(voucher.max_discount_amount));
      }
    }

    discountAmount = Math.min(discountAmount, orderValue + (voucher.is_freeship ? Number(shippingFee) : 0));
    const finalAmount = Math.max(0, orderValue - (voucher.is_freeship ? 0 : discountAmount));

    return {
      valid: true,
      isValid: true,
      code: voucher.code,
      isFreeship: voucher.is_freeship,
      discountAmount,
      finalAmount,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        is_freeship: voucher.is_freeship,
      },
    };
  }

  // Tăng lượt sử dụng khi chốt đơn thành công và ghi nhật ký người dùng (Giao dịch an toàn & Chống Race Condition)
  async claimVoucher(code: string, userId?: string, orderId?: string) {
    const normalizedCode = code.trim().toUpperCase();

    return await this.dataSource.transaction(async (manager) => {
      // 1. Khóa dòng voucher (SELECT FOR UPDATE) ngay từ đầu để serialize giao dịch và chống MVCC phantom snapshot
      const voucher = await manager
        .createQueryBuilder(Voucher, 'v')
        .setLock('pessimistic_write')
        .where('v.code = :code', { code: normalizedCode })
        .getOne();

      if (!voucher) {
        throw new NotFoundException('Voucher không tồn tại');
      }

      // 2. Kiểm tra tính Idempotent: Nếu orderId này đã claim voucher rồi thì trả về kết quả thành công, không trừ lần 2
      if (orderId) {
        const existingUsage = await manager.findOne(VoucherUsage, {
          where: { order_id: orderId, status: UsageStatus.USED },
        });
        if (existingUsage) {
          return voucher;
        }
      }

      if (!voucher.is_active) {
        throw new BadRequestException('Voucher hiện đang bị tạm dừng');
      }

      const now = new Date();
      if (now < new Date(voucher.start_date) || now > new Date(voucher.end_date)) {
        throw new BadRequestException('Voucher đã hết hạn hoặc chưa đến ngày áp dụng');
      }

      // 3. Kiểm tra tổng lượt dùng toàn hệ thống
      if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
        throw new BadRequestException('Voucher đã hết số lượt sử dụng trên hệ thống');
      }

      // 4. Kiểm tra giới hạn dùng của User dưới khoá giao dịch (dùng locking current read chống phantom snapshot)
      if (userId && userId.trim() !== '' && userId !== 'anonymous') {
        const maxPerUser = voucher.max_usage_per_user || 1;
        const userUsages = await manager
          .createQueryBuilder(VoucherUsage, 'u')
          .setLock('pessimistic_write')
          .where('u.voucher_id = :voucherId AND u.user_id = :userId AND u.status = :status', {
            voucherId: voucher.id,
            userId: userId.trim(),
            status: UsageStatus.USED,
          })
          .getMany();

        if (userUsages.length >= maxPerUser) {
          throw new BadRequestException('Bạn đã dùng hết số lượt cho phép của voucher này');
        }
      }

      // 5. Tăng số lượt dùng nguyên tử
      voucher.used_count += 1;
      await manager.save(voucher);

      // 6. Ghi nhận nhật ký sử dụng của User
      if (userId && orderId) {
        const usage = manager.create(VoucherUsage, {
          voucher_id: voucher.id,
          user_id: userId.trim(),
          order_id: orderId.trim(),
          status: UsageStatus.USED,
        });
        await manager.save(usage);
      }

      return voucher;
    });
  }

  // HOÀN LẠI MÃ CHO NGƯỜI DÙNG KHI HUỶ ĐƠN HOẶC ROLLBACK SAGA (IDEMPOTENT)
  async releaseVoucher(code: string, userId?: string, orderId?: string) {
    const normalizedCode = code.trim().toUpperCase();

    return await this.dataSource.transaction(async (manager) => {
      // 1. Khoá dòng voucher để cập nhật chính xác
      const voucher = await manager
        .createQueryBuilder(Voucher, 'v')
        .setLock('pessimistic_write')
        .where('v.code = :code', { code: normalizedCode })
        .getOne();

      if (!voucher) {
        return { success: false, message: 'Voucher không tồn tại' };
      }

      // 2. Kiểm tra tính Idempotent: Chỉ giảm used_count nếu tìm thấy lượt dùng USED thật sự
      if (orderId) {
        const whereClause: any = {
          voucher_id: voucher.id,
          order_id: orderId.trim(),
          status: UsageStatus.USED,
        };
        if (userId && userId.trim() !== '') {
          whereClause.user_id = userId.trim();
        }

        const usage = await manager.findOne(VoucherUsage, {
          where: whereClause,
        });

        if (!usage) {
          return {
            success: true,
            message: 'Đơn hàng này chưa dùng hoặc đã được hoàn lại voucher trước đó (Idempotent)',
          };
        }

        usage.status = UsageStatus.REFUNDED;
        await manager.save(usage);

        if (voucher.used_count > 0) {
          voucher.used_count -= 1;
          await manager.save(voucher);
        }

        return {
          success: true,
          message: `Đã mở lại mã giảm giá '${normalizedCode}' cho tài khoản thành công.`,
        };
      }

      // Fallback nếu không có userId / orderId
      if (voucher.used_count > 0) {
        voucher.used_count -= 1;
        await manager.save(voucher);
      }

      return {
        success: true,
        message: `Đã hoàn lại lượt dùng mã giảm giá '${normalizedCode}'.`,
      };
    });
  }

  async createVoucher(dto: CreateVoucherDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.voucherRepo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Mã voucher '${code}' đã tồn tại trong hệ thống.`);
    }

    if (dto.discount_type === DiscountType.PERCENTAGE && dto.discount_value > 100) {
      throw new BadRequestException('Phần trăm giảm giá không được vượt quá 100%.');
    }

    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);
    if (endDate <= startDate) {
      throw new BadRequestException('Ngày kết thúc phải lớn hơn ngày bắt đầu áp dụng.');
    }

    const voucher = this.voucherRepo.create({
      ...dto,
      code,
      max_usage_per_user: dto.max_usage_per_user || 1,
      start_date: startDate,
      end_date: endDate,
    });
    return this.voucherRepo.save(voucher);
  }

  async toggleVoucher(id: string) {
    const voucher = await this.voucherRepo.findOne({ where: { id } });
    if (!voucher) throw new NotFoundException('Không tìm thấy voucher');
    voucher.is_active = !voucher.is_active;
    return this.voucherRepo.save(voucher);
  }

  private normalizeApplyDate(applyDate?: string | null): string | null {
    if (!applyDate) return null;
    const trimmed = String(applyDate).trim();
    return trimmed ? trimmed.slice(0, 10) : null;
  }

  private toVnDateStr(date: Date = new Date()): string {
    return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  private async validateNoOverlappingCampaign(
    startTime: string,
    endTime: string,
    applyDate?: string | null,
    excludeCampaignId?: string,
  ) {
    const s1 = startTime.length === 5 ? `${startTime}:00` : startTime;
    const e1 = endTime.length === 5 ? `${endTime}:00` : endTime;
    const targetDate = this.normalizeApplyDate(applyDate);

    const allCampaigns = await this.campaignRepo.find({
      where: { is_active: true },
    });

    for (const c of allCampaigns) {
      if (excludeCampaignId && c.id === excludeCampaignId) continue;

      const existingDate = this.normalizeApplyDate(c.apply_date);
      const dateOverlap =
        !targetDate || !existingDate || targetDate === existingDate;

      if (!dateOverlap) continue;

      const s2 = c.start_time.length === 5 ? `${c.start_time}:00` : c.start_time;
      const e2 = c.end_time.length === 5 ? `${c.end_time}:00` : c.end_time;

      const timeOverlap = s1 < e2 && s2 < e1;

      if (timeOverlap) {
        throw new ConflictException(
          `Khung giờ ${s1.slice(0, 5)} - ${e1.slice(0, 5)} bị trùng với ca Giờ Vàng '${c.name}' (${s2.slice(0, 5)} - ${e2.slice(0, 5)}). Mỗi khung giờ chỉ được phép tồn tại duy nhất 1 ca Giờ Vàng.`,
        );
      }
    }
  }

  async createFlashSale(dto: CreateFlashSaleDto) {
    const normalizedDate = this.normalizeApplyDate(dto.apply_date);
    if (dto.is_active !== false) {
      await this.validateNoOverlappingCampaign(
        dto.start_time,
        dto.end_time,
        normalizedDate,
      );
    }

    const campaign = this.campaignRepo.create({
      name: dto.name,
      apply_date: normalizedDate as any,
      start_time: dto.start_time,
      end_time: dto.end_time,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
      banner_url: dto.banner_url,
      items: (dto.items || []).map((i) =>
        this.itemRepo.create({
          product_id: i.product_id,
          product_name: i.product_name,
          product_image: i.product_image,
          original_price: Number(i.original_price),
          sale_price: Number(i.sale_price),
          discount_percentage: Number(i.discount_percentage) || 0,
          quantity_limit: Number(i.quantity_limit) || 50,
          sold_count: 0,
          max_per_user: Number(i.max_per_user) || 2,
        }),
      ),
    });

    return this.campaignRepo.save(campaign);
  }

  async getAllFlashSales() {
    return this.campaignRepo.find({
      relations: ['items'],
      order: { created_at: 'DESC' },
    });
  }

  async getFlashSaleById(id: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch Giờ Vàng');
    return campaign;
  }

  async updateFlashSale(id: string, dto: UpdateFlashSaleDto) {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch Giờ Vàng');

    const targetStart = dto.start_time !== undefined ? dto.start_time : campaign.start_time;
    const targetEnd = dto.end_time !== undefined ? dto.end_time : campaign.end_time;
    const targetDate =
      dto.apply_date !== undefined
        ? this.normalizeApplyDate(dto.apply_date)
        : this.normalizeApplyDate(campaign.apply_date);
    const targetActive = dto.is_active !== undefined ? dto.is_active : campaign.is_active;

    if (targetActive) {
      await this.validateNoOverlappingCampaign(
        targetStart,
        targetEnd,
        targetDate,
        id,
      );
    }

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.apply_date !== undefined) campaign.apply_date = targetDate as any;
    if (dto.start_time !== undefined) campaign.start_time = dto.start_time;
    if (dto.end_time !== undefined) campaign.end_time = dto.end_time;
    if (dto.is_active !== undefined) campaign.is_active = dto.is_active;
    if (dto.banner_url !== undefined) campaign.banner_url = dto.banner_url;

    if (dto.items && Array.isArray(dto.items)) {
      if (campaign.items && campaign.items.length > 0) {
        await this.itemRepo.remove(campaign.items);
      }
      campaign.items = dto.items.map((i) =>
        this.itemRepo.create({
          product_id: i.product_id,
          product_name: i.product_name,
          product_image: i.product_image,
          original_price: Number(i.original_price),
          sale_price: Number(i.sale_price),
          discount_percentage: Number(i.discount_percentage) || 0,
          quantity_limit: Number(i.quantity_limit) || 50,
          sold_count: 0,
          max_per_user: Number(i.max_per_user) || 2,
        }),
      );
    }

    return this.campaignRepo.save(campaign);
  }

  async toggleFlashSale(id: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');

    const nextActive = !campaign.is_active;
    if (nextActive) {
      await this.validateNoOverlappingCampaign(
        campaign.start_time,
        campaign.end_time,
        campaign.apply_date,
        id,
      );
    }

    campaign.is_active = nextActive;
    return this.campaignRepo.save(campaign);
  }

  async deleteFlashSale(id: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');
    await this.campaignRepo.remove(campaign);
    return { success: true, message: 'Đã xoá chiến dịch thành công' };
  }

  async getActiveOrUpcomingFlashSale() {
    const campaigns = await this.campaignRepo.find({
      where: { is_active: true },
      relations: ['items'],
      order: { start_time: 'ASC' },
    });

    if (campaigns.length === 0) {
      return { status: 'NONE', campaign: null, items: [] };
    }

    const vnDate = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const currentHours = String(vnDate.getUTCHours()).padStart(2, '0');
    const currentMinutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
    const currentSeconds = String(vnDate.getUTCSeconds()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}:${currentSeconds}`;
    const todayStr = vnDate.toISOString().split('T')[0];

    // Tự động reset sold_count sang 0 khi qua ngày mới cho các ca "Lặp lại mỗi ngày" (apply_date = null)
    for (const c of campaigns) {
      if (!this.normalizeApplyDate(c.apply_date) && c.items && c.items.length > 0) {
        const lastUpdatedVn = c.updated_at ? this.toVnDateStr(new Date(c.updated_at)) : todayStr;
        if (lastUpdatedVn < todayStr && c.items.some((i) => Number(i.sold_count) > 0)) {
          for (const item of c.items) {
            item.sold_count = 0;
          }
          await this.itemRepo.save(c.items);
          await this.campaignRepo.update(c.id, { updated_at: new Date() });
        }
      }
    }

    const validCampaigns = campaigns
      .filter((c) => {
        const d = this.normalizeApplyDate(c.apply_date);
        if (!d) return true;
        return d === todayStr;
      })
      .sort((a, b) => {
        const aSpecific = this.normalizeApplyDate(a.apply_date) ? 0 : 1;
        const bSpecific = this.normalizeApplyDate(b.apply_date) ? 0 : 1;
        if (aSpecific !== bSpecific) return aSpecific - bSpecific;
        return a.start_time.localeCompare(b.start_time);
      });

    if (validCampaigns.length === 0) {
      return { status: 'NONE', campaign: null, items: [] };
    }

    const activeCampaign = validCampaigns.find((c) => {
      const s = c.start_time.length === 5 ? `${c.start_time}:00` : c.start_time;
      const e = c.end_time.length === 5 ? `${c.end_time}:00` : c.end_time;
      return currentTimeStr >= s && currentTimeStr <= e;
    });

    if (activeCampaign) {
      return {
        status: 'ACTIVE',
        campaign: activeCampaign,
        startTime: activeCampaign.start_time,
        endTime: activeCampaign.end_time,
        targetTime: activeCampaign.end_time,
        items: activeCampaign.items || [],
      };
    }

    const upcomingCampaign = validCampaigns.find((c) => {
      const s = c.start_time.length === 5 ? `${c.start_time}:00` : c.start_time;
      return currentTimeStr < s;
    });

    if (upcomingCampaign) {
      return {
        status: 'UPCOMING',
        campaign: upcomingCampaign,
        startTime: upcomingCampaign.start_time,
        endTime: upcomingCampaign.end_time,
        targetTime: upcomingCampaign.start_time,
        items: upcomingCampaign.items || [],
      };
    }

    return { status: 'NONE', campaign: null, items: [] };
  }

  async getTodayDeals() {
    const flashSale = await this.getActiveOrUpcomingFlashSale();
    const vouchers = await this.getPublicVouchers();

    const currentCampaign = flashSale.campaign;
    const deals = [];

    if (flashSale.status === 'ACTIVE' && currentCampaign) {
      for (const item of currentCampaign.items || []) {
        deals.push({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          original_price: Number(item.original_price),
          sale_price: Number(item.sale_price),
          discount_percentage: Number(item.discount_percentage) || 0,
          quantity_limit: Number(item.quantity_limit) || 50,
          sold_count: Number(item.sold_count) || 0,
          max_per_user: Number(item.max_per_user) || 2,
          campaign_id: currentCampaign.id,
          campaign_name: currentCampaign.name,
          start_time: currentCampaign.start_time,
          end_time: currentCampaign.end_time,
          status: flashSale.status,
        });
      }
    }

    return {
      flashSale,
      vouchers,
      deals,
    };
  }

  async recordFlashSalePurchases(items: Array<{ productId: string; quantity: number }>) {
    const current = await this.getActiveOrUpcomingFlashSale();
    if (current.status !== 'ACTIVE' || !current.campaign || !current.items || current.items.length === 0) {
      return { success: true, updated: 0 };
    }

    let updatedCount = 0;
    for (const p of items) {
      const match = current.items.find((item) => String(item.product_id) === String(p.productId));
      if (match) {
        match.sold_count = (match.sold_count || 0) + Number(p.quantity || 1);
        await this.itemRepo.save(match);
        updatedCount++;
      }
    }

    return { success: true, updated: updatedCount };
  }

  async rollbackFlashSalePurchases(items: Array<{ productId: string; quantity: number }>) {
    const current = await this.getActiveOrUpcomingFlashSale();
    if (!current.campaign || !current.items || current.items.length === 0) {
      return { success: true, rolledBack: 0 };
    }

    let rolledBackCount = 0;
    for (const p of items) {
      const match = current.items.find((item) => String(item.product_id) === String(p.productId));
      if (match) {
        match.sold_count = Math.max(0, (match.sold_count || 0) - Number(p.quantity || 1));
        await this.itemRepo.save(match);
        rolledBackCount++;
      }
    }

    return { success: true, rolledBack: rolledBackCount };
  }

  // ==================== COMBO & BUNDLE DEALS ====================

  private hasLegacyProductIds(combos: Combo[]): boolean {
    return combos.some((c) =>
      (c.items || []).some((i) => /^p[1-5]$/.test(String(i.product_id)))
    );
  }

  async getAllCombos(): Promise<Combo[]> {
    let combos = await this.comboRepo.find({
      relations: ['items'],
      order: { created_at: 'DESC' },
    });
    if (combos.length === 0 || this.hasLegacyProductIds(combos)) {
      await this.seedAndSyncCombosAndGifts();
      combos = await this.comboRepo.find({
        relations: ['items'],
        order: { created_at: 'DESC' },
      });
    }
    return combos;
  }

  async getPublicCombos(): Promise<Combo[]> {
    const now = new Date();
    let combos = await this.comboRepo.find({
      where: { is_active: true },
      relations: ['items'],
      order: { created_at: 'DESC' },
    });
    if (combos.length === 0 || this.hasLegacyProductIds(combos)) {
      await this.seedAndSyncCombosAndGifts();
      combos = await this.comboRepo.find({
        where: { is_active: true },
        relations: ['items'],
        order: { created_at: 'DESC' },
      });
    }

    return combos.filter((combo) => {
      if (combo.start_date && new Date(combo.start_date) > now) return false;
      if (combo.end_date && new Date(combo.end_date) < now) return false;
      if (
        combo.max_quantity !== null &&
        combo.max_quantity !== undefined &&
        combo.sold_count >= combo.max_quantity
      ) {
        return false;
      }
      return Array.isArray(combo.items) && combo.items.length > 0;
    });
  }

  async getComboById(id: string): Promise<Combo> {
    const combo = await this.comboRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!combo) {
      throw new NotFoundException(`Không tìm thấy Combo với ID ${id}`);
    }
    return combo;
  }

  async createCombo(dto: CreateComboDto): Promise<Combo> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Combo phải có ít nhất 1 sản phẩm thành phần');
    }

    const totalItemQty = dto.items.reduce((sum, i) => sum + Number(i.quantity || 1), 0);
    if (totalItemQty < 2) {
      throw new BadRequestException('Combo phải có tổng số lượng từ 2 sản phẩm trở lên');
    }

    if (dto.start_date && dto.end_date && new Date(dto.end_date) <= new Date(dto.start_date)) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    const calculatedOriginal = dto.items.reduce(
      (sum, item) => sum + (Number(item.original_price) || 0) * (Number(item.quantity) || 1),
      0,
    );
    const originalPrice =
      dto.original_price !== undefined && dto.original_price > 0
        ? Number(dto.original_price)
        : calculatedOriginal;

    if (originalPrice > 0 && Number(dto.combo_price) > originalPrice) {
      throw new BadRequestException('Giá bán Combo không được lớn hơn tổng giá gốc');
    }

    const combo = this.comboRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      combo_price: Number(dto.combo_price),
      original_price: originalPrice,
      image_url: dto.image_url?.trim() || null,
      start_date: dto.start_date ? new Date(dto.start_date) : null,
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      max_quantity: dto.max_quantity ?? null,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
      items: dto.items.map((item) =>
        this.comboItemRepo.create({
          product_id: item.product_id,
          product_name: item.product_name || null,
          product_image: item.product_image || null,
          original_price: Number(item.original_price) || 0,
          quantity: Number(item.quantity) || 1,
        }),
      ),
    });

    return this.comboRepo.save(combo);
  }

  async updateCombo(id: string, dto: UpdateComboDto): Promise<Combo> {
    const combo = await this.getComboById(id);

    if (dto.name !== undefined) combo.name = dto.name.trim();
    if (dto.description !== undefined) combo.description = dto.description?.trim() || null;
    if (dto.image_url !== undefined) combo.image_url = dto.image_url?.trim() || null;
    if (dto.start_date !== undefined) {
      combo.start_date = dto.start_date ? new Date(dto.start_date) : null;
    }
    if (dto.end_date !== undefined) {
      combo.end_date = dto.end_date ? new Date(dto.end_date) : null;
    }
    if (combo.start_date && combo.end_date && combo.end_date <= combo.start_date) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }
    if (dto.max_quantity !== undefined) combo.max_quantity = dto.max_quantity ?? null;
    if (dto.is_active !== undefined) combo.is_active = dto.is_active;

    if (dto.items !== undefined) {
      await this.comboItemRepo.delete({ combo_id: combo.id });
      combo.items = dto.items.map((item) =>
        this.comboItemRepo.create({
          combo_id: combo.id,
          product_id: item.product_id,
          product_name: item.product_name || null,
          product_image: item.product_image || null,
          original_price: Number(item.original_price) || 0,
          quantity: Number(item.quantity) || 1,
        }),
      );
      const calculatedOriginal = dto.items.reduce(
        (sum, item) => sum + (Number(item.original_price) || 0) * (Number(item.quantity) || 1),
        0,
      );
      combo.original_price =
        dto.original_price !== undefined && dto.original_price > 0
          ? Number(dto.original_price)
          : calculatedOriginal;
    } else if (dto.original_price !== undefined) {
      combo.original_price = Number(dto.original_price);
    }

    if (dto.combo_price !== undefined) {
      combo.combo_price = Number(dto.combo_price);
    }

    if (Number(combo.original_price) > 0 && Number(combo.combo_price) > Number(combo.original_price)) {
      throw new BadRequestException('Giá bán Combo không được lớn hơn tổng giá gốc');
    }

    return this.comboRepo.save(combo);
  }

  async toggleCombo(id: string): Promise<Combo> {
    const combo = await this.getComboById(id);
    combo.is_active = !combo.is_active;
    return this.comboRepo.save(combo);
  }

  async deleteCombo(id: string): Promise<{ success: boolean; message: string }> {
    const combo = await this.getComboById(id);
    await this.comboRepo.remove(combo);
    return { success: true, message: 'Đã xóa Combo thành công' };
  }

  async recordComboPurchases(combos: Array<{ comboId: string; quantity: number }>) {
    let updatedCount = 0;
    for (const entry of combos) {
      const combo = await this.comboRepo.findOne({ where: { id: entry.comboId } });
      if (!combo) continue;
      const qty = Math.max(1, Number(entry.quantity) || 1);
      combo.sold_count = (Number(combo.sold_count) || 0) + qty;
      await this.comboRepo.save(combo);
      updatedCount++;
    }
    return { success: true, updated: updatedCount };
  }

  async rollbackComboPurchases(combos: Array<{ comboId: string; quantity: number }>) {
    let rolledBackCount = 0;
    for (const entry of combos) {
      const combo = await this.comboRepo.findOne({ where: { id: entry.comboId } });
      if (!combo) continue;
      const qty = Math.max(1, Number(entry.quantity) || 1);
      combo.sold_count = Math.max(0, (Number(combo.sold_count) || 0) - qty);
      await this.comboRepo.save(combo);
      rolledBackCount++;
    }
    return { success: true, rolledBack: rolledBackCount };
  }

  // ==================== SPIN WHEEL API ====================

  private getSpinPrizes() {
    return [
      { id: 'prize-10k', label: 'Voucher 10K', weight: 25, isWinning: true, code: 'CSM10K' },
      { id: 'prize-topping', label: 'Free Topping', weight: 25, isWinning: true, code: 'TOPPINGFREE' },
      { id: 'prize-drink15', label: 'Giảm 15% Nước', weight: 20, isWinning: true, code: 'DRINK15' },
      { id: 'prize-freeship', label: 'Freeship Đơn', weight: 15, isWinning: true, code: 'FREESHIP99' },
      { id: 'prize-luck', label: 'Chúc May Mắn', weight: 10, isWinning: false, code: null },
      { id: 'prize-20k', label: 'Voucher 20K', weight: 5, isWinning: true, code: 'CSM20KSPECIAL' },
    ];
  }

  async getSpinStatus(userId?: string) {
    if (!userId) {
      return { hasSpunToday: false, todayRecord: null };
    }
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const existing = await this.spinHistoryRepo.findOne({
      where: { user_id: String(userId), spin_date: today },
    });
    return { hasSpunToday: !!existing, todayRecord: existing || null };
  }

  async spinWheel(userId?: string) {
    if (!userId) {
      throw new BadRequestException('Vui lòng đăng nhập để tham gia Vòng Quay May Mắn');
    }
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const existing = await this.spinHistoryRepo.findOne({
      where: { user_id: String(userId), spin_date: today },
    });
    if (existing) {
      throw new ConflictException('Bạn đã hết lượt quay hôm nay. Hãy quay lại vào ngày mai!');
    }

    const prizes = this.getSpinPrizes();
    const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < prizes.length; i++) {
      if (rand < prizes[i].weight) {
        chosenIdx = i;
        break;
      }
      rand -= prizes[i].weight;
    }
    const chosen = prizes[chosenIdx];

    if (chosen.isWinning && chosen.code) {
      const existingVoucher = await this.voucherRepo.findOne({ where: { code: chosen.code } });
      if (!existingVoucher) {
        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);
        await this.voucherRepo.save(
          this.voucherRepo.create({
            code: chosen.code,
            description: `Phần thưởng Vòng Quay May Mắn: ${chosen.label}`,
            discount_type: chosen.code === 'DRINK15' ? DiscountType.PERCENTAGE : DiscountType.FIXED_AMOUNT,
            discount_value: chosen.code === 'CSM20KSPECIAL' ? 20000 : chosen.code === 'DRINK15' ? 15 : 10000,
            min_order_value: 50000,
            usage_limit: 5000,
            max_usage_per_user: 10,
            is_freeship: chosen.code === 'FREESHIP99',
            start_date: now,
            end_date: nextYear,
            is_active: true,
          }),
        );
      }
    }

    const record = await this.spinHistoryRepo.save(
      this.spinHistoryRepo.create({
        user_id: String(userId),
        spin_date: today,
        prize_id: chosen.id,
        prize_label: chosen.label,
        voucher_code: chosen.code || null,
      }),
    );

    return {
      prizeIndex: chosenIdx,
      prizeId: chosen.id,
      prizeLabel: chosen.label,
      voucherCode: chosen.code,
      record,
    };
  }
}
