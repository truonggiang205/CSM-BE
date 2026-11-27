import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UseFilters,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Banner, BANNER_PLACEMENTS, BannerPlacement } from '../entities/banner.entity';
import { Announcement } from '../entities/announcement.entity';
import { HomeLayout, HOME_BLOCK_KEYS, HomeLayoutBlock } from '../entities/home-layout.entity';
import { HomeSection, HOME_SECTION_TYPES, HomeSectionType } from '../entities/home-section.entity';
import { HomeSectionItem } from '../entities/home-section-item.entity';
import { Product } from '../entities/product.entity';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { MulterExceptionFilter } from '../filters/multer-exception.filter';
import {
  CreateBannerDto,
  UpdateBannerDto,
  ReorderBannersDto,
  UpsertSectionDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UpsertLayoutDto,
} from '../dto/storefront.dto';
import { saveUploadedImage, MAX_IMAGE_SIZE } from '../utils/image-upload';
import {
  getActor,
  normalizeBranchId,
  resolveWritableBranch,
  assertCanManage,
  parseDate,
  assertDateRange,
  isLive,
} from './storefront.access';

const MANAGERS = ['ADMIN', 'BRANCH_MANAGER'];

function branchWhere(branchId: string | null) {
  return branchId === null ? IsNull() : branchId;
}

function normalizePlacement(raw?: string): BannerPlacement | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const upper = String(raw).toUpperCase();
  if (!(BANNER_PLACEMENTS as readonly string[]).includes(upper)) {
    throw new BadRequestException(`Vị trí banner không hợp lệ. Chấp nhận: ${BANNER_PLACEMENTS.join(', ')}`);
  }
  return upper as BannerPlacement;
}

/** Sắp xếp: bản ghi của chi nhánh trước, toàn chuỗi sau, rồi theo sort_order. */
function branchFirst<T extends { branch_id: string | null; sort_order: number }>(a: T, b: T): number {
  const aBranch = a.branch_id ? 0 : 1;
  const bBranch = b.branch_id ? 0 : 1;
  if (aBranch !== bBranch) return aBranch - bBranch;
  return a.sort_order - b.sort_order;
}

/** Chuẩn hoá bố cục: bỏ khóa trùng, bổ sung khối còn thiếu (ẩn ở cuối) để FE luôn đủ 10 khối. */
export function normalizeLayoutBlocks(blocks: HomeLayoutBlock[]): HomeLayoutBlock[] {
  const seen = new Set<string>();
  const result: HomeLayoutBlock[] = [];
  for (const b of blocks || []) {
    if (!(HOME_BLOCK_KEYS as readonly string[]).includes(b.key) || seen.has(b.key)) continue;
    seen.add(b.key);
    result.push({ key: b.key, visible: !!b.visible });
  }
  for (const key of HOME_BLOCK_KEYS) {
    if (!seen.has(key)) result.push({ key, visible: true });
  }
  return result;
}

function assertSectionType(type: string): HomeSectionType {
  const upper = String(type || '').toUpperCase();
  if (!(HOME_SECTION_TYPES as readonly string[]).includes(upper)) {
    throw new BadRequestException(`Loại khối không hợp lệ. Chấp nhận: ${HOME_SECTION_TYPES.join(', ')}`);
  }
  return upper as HomeSectionType;
}

@Controller('storefront')
@UseGuards(RolesGuard)
export class StorefrontController {
  constructor(
    @InjectRepository(Banner)
    private readonly bannerRepository: Repository<Banner>,
    @InjectRepository(HomeSection)
    private readonly sectionRepository: Repository<HomeSection>,
    @InjectRepository(HomeSectionItem)
    private readonly sectionItemRepository: Repository<HomeSectionItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(HomeLayout)
    private readonly layoutRepository: Repository<HomeLayout>,
  ) {}

  // ---------------------------------------------------------------------------
  // PUBLIC: dữ liệu trang chủ cho khách
  // ---------------------------------------------------------------------------

  /**
   * GET /storefront/home?branchId=br-01
   * Toàn bộ nội dung giao diện cho khách, theo chi nhánh đang chọn:
   * - banners: slider trang chủ (HOME_HERO); placements: banner ở các vị trí khác
   * - announcements: thanh thông báo trên cùng
   * - sections: các khối sản phẩm nổi bật; layout: thứ tự/bật tắt khối trang chủ
   * Nội dung chi nhánh luôn đứng trước/ghi đè nội dung toàn chuỗi.
   */
  @Get('home')
  async getHome(@Query('branchId') rawBranchId?: string) {
    const branchId = normalizeBranchId(rawBranchId);
    const now = new Date();
    const scopes = branchId ? [IsNull(), branchId] : [IsNull()];

    const bannerRows = await this.bannerRepository.find({
      where: scopes.map((b) => ({ branch_id: b as any, is_active: true })),
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });

    const liveBanners = bannerRows.filter((b) => isLive(b, now)).sort(branchFirst);
    const byPlacement = (p: BannerPlacement) => liveBanners.filter((b) => (b.placement || 'HOME_HERO') === p);
    const banners = byPlacement('HOME_HERO');
    const placements = {
      PRODUCTS_TOP: byPlacement('PRODUCTS_TOP'),
      CART: byPlacement('CART'),
      POPUP: byPlacement('POPUP').slice(0, 1),
    };

    const announcementRows = await this.announcementRepository.find({
      where: scopes.map((b) => ({ branch_id: b as any, is_active: true })),
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
    const announcements = announcementRows.filter((a) => isLive(a, now)).sort(branchFirst);

    const layoutRows = await this.layoutRepository.find({
      where: scopes.map((b) => ({ branch_id: b as any })),
    });
    const layoutRow =
      (branchId && layoutRows.find((l) => l.branch_id === branchId)) || layoutRows.find((l) => l.branch_id === null);
    const layout = layoutRow ? normalizeLayoutBlocks(layoutRow.blocks) : null;

    const sectionRows = await this.sectionRepository.find({
      where: scopes.map((b) => ({ branch_id: b as any })),
      relations: ['items', 'items.product', 'items.product.category'],
    });

    // Khối chỉ được dùng khi đang hiệu lực và có ít nhất 1 sản phẩm còn tồn tại;
    // khối rỗng nhường lại cho khối toàn chuỗi hoặc cách chọn mặc định ở Frontend.
    // Riêng FLASH_SALE: sản phẩm & giá lấy từ chiến dịch Flash Sale (discount-service),
    // khối ở đây chỉ giữ tiêu đề / mô tả / lịch hiển thị nên không cần sản phẩm.
    const usable = (s: HomeSection) =>
      isLive(s, now) && (s.type === 'FLASH_SALE' || (s.items || []).some((i) => i.product));

    const sections: Record<string, any> = {};
    for (const type of HOME_SECTION_TYPES) {
      const branchSection = branchId
        ? sectionRows.find((s) => s.type === type && s.branch_id === branchId && usable(s))
        : undefined;
      const globalSection = sectionRows.find((s) => s.type === type && s.branch_id === null && usable(s));
      const chosen = branchSection || globalSection;
      sections[type] = chosen ? this.serializeSection(chosen) : null;
    }

    return { branch_id: branchId, banners, placements, announcements, sections, layout };
  }

  // ---------------------------------------------------------------------------
  // ADMIN / BRANCH_MANAGER: quản lý banner
  // ---------------------------------------------------------------------------

  /** GET /storefront/banners?branchId=global|br-01 — danh sách banner của một phạm vi (kể cả đang tắt). */
  @Roles(...MANAGERS)
  @Get('banners')
  async listBanners(
    @Headers() headers: Record<string, any>,
    @Query('branchId') rawBranchId?: string,
    @Query('placement') rawPlacement?: string,
  ) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    const placement = normalizePlacement(rawPlacement);
    return this.bannerRepository.find({
      where: { branch_id: branchWhere(branchId) as any, ...(placement ? { placement } : {}) },
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
  }

  @Roles(...MANAGERS)
  @Post('banners')
  async createBanner(@Headers() headers: Record<string, any>, @Body() body: CreateBannerDto) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, body.branch_id);
    const start_at = parseDate(body.start_at) ?? null;
    const end_at = parseDate(body.end_at) ?? null;
    assertDateRange(start_at, end_at);

    const placement = body.placement || 'HOME_HERO';
    let sortOrder = body.sort_order;
    if (sortOrder === undefined) {
      const last = await this.bannerRepository.findOne({
        where: { branch_id: branchWhere(branchId) as any, placement },
        order: { sort_order: 'DESC' },
      });
      sortOrder = last ? last.sort_order + 1 : 0;
    }

    const banner = this.bannerRepository.create({
      placement,
      title: body.title,
      highlight: body.highlight ?? null,
      badge: body.badge ?? null,
      description: body.description ?? null,
      image_url: body.image_url,
      link_url: body.link_url ?? null,
      cta_text: body.cta_text ?? null,
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
      start_at,
      end_at,
      branch_id: branchId,
      created_by: actor.userId,
    });
    return this.bannerRepository.save(banner);
  }

  /** PUT /storefront/banners/reorder — body { ids: [...] } theo thứ tự mới. Khai báo trước banners/:id. */
  @Roles(...MANAGERS)
  @Put('banners/reorder')
  async reorderBanners(@Headers() headers: Record<string, any>, @Body() body: ReorderBannersDto) {
    const actor = getActor(headers);
    if (!body.ids.length) return { success: true, updated: 0 };

    const banners = await this.bannerRepository.find({ where: { id: In(body.ids) } });
    if (banners.length !== new Set(body.ids).size) {
      throw new NotFoundException('Có banner không tồn tại trong danh sách sắp xếp');
    }
    const scope = banners[0].branch_id;
    const placement = banners[0].placement;
    for (const b of banners) {
      assertCanManage(actor, b.branch_id);
      if (b.branch_id !== scope || b.placement !== placement) {
        throw new BadRequestException('Chỉ sắp xếp được các banner cùng phạm vi và cùng vị trí');
      }
    }

    const byId = new Map(banners.map((b) => [b.id, b]));
    const updated = body.ids.map((id, index) => {
      const b = byId.get(id)!;
      b.sort_order = index;
      return b;
    });
    await this.bannerRepository.save(updated);
    return { success: true, updated: updated.length };
  }

  @Roles(...MANAGERS)
  @Put('banners/:id')
  async updateBanner(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
    @Body() body: UpdateBannerDto,
  ) {
    const actor = getActor(headers);
    const banner = await this.bannerRepository.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Không tìm thấy banner');
    assertCanManage(actor, banner.branch_id);

    const fields: (keyof UpdateBannerDto)[] = [
      'placement',
      'title',
      'highlight',
      'badge',
      'description',
      'image_url',
      'link_url',
      'cta_text',
      'sort_order',
      'is_active',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) (banner as any)[f] = body[f];
    }
    const start = parseDate(body.start_at);
    const end = parseDate(body.end_at);
    if (start !== undefined) banner.start_at = start;
    if (end !== undefined) banner.end_at = end;
    assertDateRange(banner.start_at, banner.end_at);

    return this.bannerRepository.save(banner);
  }

  @Roles(...MANAGERS)
  @Delete('banners/:id')
  async deleteBanner(@Headers() headers: Record<string, any>, @Param('id') id: string) {
    const actor = getActor(headers);
    const banner = await this.bannerRepository.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Không tìm thấy banner');
    assertCanManage(actor, banner.branch_id);
    await this.bannerRepository.delete(id);
    return { success: true, message: 'Xóa banner thành công' };
  }

  /**
   * POST /storefront/banners/:id/click — công khai, ghi nhận 1 lượt khách bấm banner.
   * Chỉ tăng bộ đếm, không trả dữ liệu nhạy cảm.
   */
  @Post('banners/:id/click')
  @HttpCode(200)
  async trackBannerClick(@Param('id') id: string) {
    const result = await this.bannerRepository.increment({ id }, 'click_count', 1);
    if (!result.affected) throw new NotFoundException('Không tìm thấy banner');
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // ADMIN / BRANCH_MANAGER: thanh thông báo trên cùng
  // ---------------------------------------------------------------------------

  @Roles(...MANAGERS)
  @Get('announcements')
  async listAnnouncements(@Headers() headers: Record<string, any>, @Query('branchId') rawBranchId?: string) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    return this.announcementRepository.find({
      where: { branch_id: branchWhere(branchId) as any },
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
  }

  @Roles(...MANAGERS)
  @Post('announcements')
  async createAnnouncement(@Headers() headers: Record<string, any>, @Body() body: CreateAnnouncementDto) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, body.branch_id);
    const start_at = parseDate(body.start_at) ?? null;
    const end_at = parseDate(body.end_at) ?? null;
    assertDateRange(start_at, end_at);

    let sortOrder = body.sort_order;
    if (sortOrder === undefined) {
      const last = await this.announcementRepository.findOne({
        where: { branch_id: branchWhere(branchId) as any },
        order: { sort_order: 'DESC' },
      });
      sortOrder = last ? last.sort_order + 1 : 0;
    }

    const item = this.announcementRepository.create({
      message: body.message,
      link_url: body.link_url ?? null,
      link_text: body.link_text ?? null,
      tone: body.tone ?? 'primary',
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
      start_at,
      end_at,
      branch_id: branchId,
      created_by: actor.userId,
    });
    return this.announcementRepository.save(item);
  }

  @Roles(...MANAGERS)
  @Put('announcements/:id')
  async updateAnnouncement(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
    @Body() body: UpdateAnnouncementDto,
  ) {
    const actor = getActor(headers);
    const item = await this.announcementRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy thông báo');
    assertCanManage(actor, item.branch_id);

    const fields: (keyof UpdateAnnouncementDto)[] = ['message', 'link_url', 'link_text', 'tone', 'sort_order', 'is_active'];
    for (const f of fields) {
      if (body[f] !== undefined) (item as any)[f] = body[f];
    }
    const start = parseDate(body.start_at);
    const end = parseDate(body.end_at);
    if (start !== undefined) item.start_at = start;
    if (end !== undefined) item.end_at = end;
    assertDateRange(item.start_at, item.end_at);
    return this.announcementRepository.save(item);
  }

  @Roles(...MANAGERS)
  @Delete('announcements/:id')
  async deleteAnnouncement(@Headers() headers: Record<string, any>, @Param('id') id: string) {
    const actor = getActor(headers);
    const item = await this.announcementRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Không tìm thấy thông báo');
    assertCanManage(actor, item.branch_id);
    await this.announcementRepository.delete(id);
    return { success: true, message: 'Đã xóa thông báo' };
  }

  // ---------------------------------------------------------------------------
  // ADMIN / BRANCH_MANAGER: bố cục trang chủ
  // ---------------------------------------------------------------------------

  /** GET /storefront/layout?branchId= — bố cục riêng của phạm vi (null nếu đang dùng mặc định/toàn chuỗi). */
  @Roles(...MANAGERS)
  @Get('layout')
  async getLayout(@Headers() headers: Record<string, any>, @Query('branchId') rawBranchId?: string) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    const row = await this.layoutRepository.findOne({ where: { branch_id: branchWhere(branchId) as any } });
    return {
      branch_id: branchId,
      blocks: row ? normalizeLayoutBlocks(row.blocks) : null,
      updated_at: row?.updated_at ?? null,
    };
  }

  @Roles(...MANAGERS)
  @Put('layout')
  async upsertLayout(@Headers() headers: Record<string, any>, @Body() body: UpsertLayoutDto) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, body.branch_id);
    const keys = body.blocks.map((b) => b.key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Mỗi khối chỉ được xuất hiện một lần');
    }
    const blocks = normalizeLayoutBlocks(body.blocks);

    let row = await this.layoutRepository.findOne({ where: { branch_id: branchWhere(branchId) as any } });
    if (!row) row = this.layoutRepository.create({ branch_id: branchId });
    row.blocks = blocks;
    row.updated_by = actor.userId;
    const saved = await this.layoutRepository.save(row);
    return { branch_id: branchId, blocks, updated_at: saved.updated_at ?? null };
  }

  @Roles(...MANAGERS)
  @Delete('layout')
  async deleteLayout(@Headers() headers: Record<string, any>, @Query('branchId') rawBranchId?: string) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    const row = await this.layoutRepository.findOne({ where: { branch_id: branchWhere(branchId) as any } });
    if (!row) throw new NotFoundException('Phạm vi này chưa có bố cục riêng');
    await this.layoutRepository.delete(row.id);
    return { success: true, message: 'Đã khôi phục bố cục mặc định' };
  }

  /** POST /storefront/images (multipart, field "image") — tải ảnh banner, trả về image_url. */
  @Roles(...MANAGERS)
  @Post('images')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_SIZE } }))
  async uploadImage(@UploadedFile() file?: Express.Multer.File) {
    const image_url = await saveUploadedImage(file);
    return { success: true, message: 'Tải ảnh thành công', image_url };
  }

  // ---------------------------------------------------------------------------
  // ADMIN / BRANCH_MANAGER: quản lý khối sản phẩm nổi bật
  // ---------------------------------------------------------------------------

  /** GET /storefront/sections?branchId=global|br-01 — cấu hình 3 khối của một phạm vi (null nếu chưa cấu hình). */
  @Roles(...MANAGERS)
  @Get('sections')
  async listSections(@Headers() headers: Record<string, any>, @Query('branchId') rawBranchId?: string) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    const rows = await this.sectionRepository.find({
      where: { branch_id: branchWhere(branchId) as any },
      relations: ['items', 'items.product', 'items.product.category'],
    });

    const result: Record<string, any> = {};
    for (const type of HOME_SECTION_TYPES) {
      const row = rows.find((r) => r.type === type);
      result[type] = row ? this.serializeSection(row, true) : null;
    }
    return { branch_id: branchId, sections: result };
  }

  /** PUT /storefront/sections/:type — tạo/cập nhật khối và thay toàn bộ danh sách sản phẩm. */
  @Roles(...MANAGERS)
  @Put('sections/:type')
  async upsertSection(
    @Headers() headers: Record<string, any>,
    @Param('type') rawType: string,
    @Body() body: UpsertSectionDto,
  ) {
    const actor = getActor(headers);
    const type = assertSectionType(rawType);
    const branchId = resolveWritableBranch(actor, body.branch_id);

    const productIds = body.items.map((i) => i.product_id);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('Một sản phẩm chỉ được thêm một lần vào mỗi khối');
    }
    const products = productIds.length
      ? await this.productRepository.find({ where: { id: In(productIds) } })
      : [];
    if (products.length !== productIds.length) {
      throw new NotFoundException('Có sản phẩm không tồn tại');
    }
    const productMap = new Map(products.map((p) => [p.id, p]));

    let section = await this.sectionRepository.findOne({
      where: { type, branch_id: branchWhere(branchId) as any },
    });
    if (!section) {
      section = this.sectionRepository.create({ type, branch_id: branchId, is_active: true });
    }

    if (body.title !== undefined) section.title = body.title;
    if (body.subtitle !== undefined) section.subtitle = body.subtitle;
    if (body.is_active !== undefined) section.is_active = body.is_active;
    const start = parseDate(body.start_at);
    const end = parseDate(body.end_at);
    if (start !== undefined) section.start_at = start;
    if (end !== undefined) section.end_at = end;
    assertDateRange(section.start_at, section.end_at);

    delete (section as any).items;
    const saved = await this.sectionRepository.save(section);

    await this.sectionItemRepository.delete({ section_id: saved.id });
    const items = body.items.map((item, index) =>
      this.sectionItemRepository.create({
        section_id: saved.id,
        product_id: item.product_id,
        sort_order: index,
        note: item.note ?? null,
      }),
    );
    if (items.length) await this.sectionItemRepository.save(items);

    saved.items = items.map((i) => ({ ...i, product: productMap.get(i.product_id)! }) as HomeSectionItem);
    return this.serializeSection(saved, true);
  }

  /** DELETE /storefront/sections/:type?branchId= — xóa cấu hình, trang chủ quay về mặc định/toàn chuỗi. */
  @Roles(...MANAGERS)
  @Delete('sections/:type')
  async deleteSection(
    @Headers() headers: Record<string, any>,
    @Param('type') rawType: string,
    @Query('branchId') rawBranchId?: string,
  ) {
    const actor = getActor(headers);
    const type = assertSectionType(rawType);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    const section = await this.sectionRepository.findOne({
      where: { type, branch_id: branchWhere(branchId) as any },
    });
    if (!section) throw new NotFoundException('Khối này chưa được cấu hình');
    await this.sectionRepository.delete(section.id);
    return { success: true, message: 'Đã xóa cấu hình khối' };
  }

  private serializeSection(section: HomeSection, includeMeta = false) {
    const items = [...(section.items || [])]
      .filter((i) => i.product)
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: section.id,
      type: section.type,
      title: section.title,
      subtitle: section.subtitle,
      is_active: section.is_active,
      start_at: section.start_at,
      end_at: section.end_at,
      branch_id: section.branch_id,
      ...(includeMeta ? { updated_at: section.updated_at } : {}),
      products: items.map((i) => ({ ...i.product, note: i.note })),
    };
  }
}
