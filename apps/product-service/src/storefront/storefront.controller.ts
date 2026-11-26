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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Banner } from '../entities/banner.entity';
import { HomeSection, HOME_SECTION_TYPES, HomeSectionType } from '../entities/home-section.entity';
import { HomeSectionItem } from '../entities/home-section-item.entity';
import { Product } from '../entities/product.entity';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { MulterExceptionFilter } from '../filters/multer-exception.filter';
import { CreateBannerDto, UpdateBannerDto, ReorderBannersDto, UpsertSectionDto } from '../dto/storefront.dto';
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
  ) {}

  // ---------------------------------------------------------------------------
  // PUBLIC: dữ liệu trang chủ cho khách
  // ---------------------------------------------------------------------------

  /**
   * GET /storefront/home?branchId=br-01
   * Trả về banner đang hiệu lực (chi nhánh trước, toàn chuỗi sau) và các khối sản phẩm nổi bật.
   * Khối của chi nhánh (nếu đang hiệu lực) ghi đè khối toàn chuỗi cùng loại.
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

    const banners = bannerRows
      .filter((b) => isLive(b, now))
      .sort((a, b) => {
        const aBranch = a.branch_id ? 0 : 1;
        const bBranch = b.branch_id ? 0 : 1;
        if (aBranch !== bBranch) return aBranch - bBranch;
        return a.sort_order - b.sort_order;
      });

    const sectionRows = await this.sectionRepository.find({
      where: scopes.map((b) => ({ branch_id: b as any })),
      relations: ['items', 'items.product', 'items.product.category'],
    });

    // Khối chỉ được dùng khi đang hiệu lực và có ít nhất 1 sản phẩm còn tồn tại;
    // khối rỗng nhường lại cho khối toàn chuỗi hoặc cách chọn mặc định ở Frontend.
    const usable = (s: HomeSection) => isLive(s, now) && (s.items || []).some((i) => i.product);

    const sections: Record<string, any> = {};
    for (const type of HOME_SECTION_TYPES) {
      const branchSection = branchId
        ? sectionRows.find((s) => s.type === type && s.branch_id === branchId && usable(s))
        : undefined;
      const globalSection = sectionRows.find((s) => s.type === type && s.branch_id === null && usable(s));
      const chosen = branchSection || globalSection;
      sections[type] = chosen ? this.serializeSection(chosen) : null;
    }

    return { branch_id: branchId, banners, sections };
  }

  // ---------------------------------------------------------------------------
  // ADMIN / BRANCH_MANAGER: quản lý banner
  // ---------------------------------------------------------------------------

  /** GET /storefront/banners?branchId=global|br-01 — danh sách banner của một phạm vi (kể cả đang tắt). */
  @Roles(...MANAGERS)
  @Get('banners')
  async listBanners(@Headers() headers: Record<string, any>, @Query('branchId') rawBranchId?: string) {
    const actor = getActor(headers);
    const branchId = resolveWritableBranch(actor, rawBranchId);
    return this.bannerRepository.find({
      where: { branch_id: branchWhere(branchId) as any },
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

    let sortOrder = body.sort_order;
    if (sortOrder === undefined) {
      const last = await this.bannerRepository.findOne({
        where: { branch_id: branchWhere(branchId) as any },
        order: { sort_order: 'DESC' },
      });
      sortOrder = last ? last.sort_order + 1 : 0;
    }

    const banner = this.bannerRepository.create({
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
    for (const b of banners) {
      assertCanManage(actor, b.branch_id);
      if (b.branch_id !== scope) {
        throw new BadRequestException('Chỉ sắp xếp được các banner trong cùng một phạm vi');
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
