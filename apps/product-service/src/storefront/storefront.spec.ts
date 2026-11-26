import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorefrontController, normalizeLayoutBlocks } from './storefront.controller';
import { resolveWritableBranch, assertCanManage, isLive, normalizeBranchId } from './storefront.access';

const ADMIN = { 'x-user-role': 'ADMIN', 'x-user-id': 'u-admin' };
const MANAGER_BR1 = { 'x-user-role': 'BRANCH_MANAGER', 'x-user-id': 'u-m1', 'x-branch-id': 'br-01' };

describe('Storefront access rules', () => {
  const admin = { role: 'ADMIN', userId: 'a', branchId: null };
  const manager = { role: 'BRANCH_MANAGER', userId: 'm', branchId: 'br-01' };

  it('normalizes global aliases to null', () => {
    expect(normalizeBranchId(undefined)).toBeNull();
    expect(normalizeBranchId('')).toBeNull();
    expect(normalizeBranchId('global')).toBeNull();
    expect(normalizeBranchId('br-02')).toBe('br-02');
  });

  it('ADMIN can write global or any branch', () => {
    expect(resolveWritableBranch(admin, undefined)).toBeNull();
    expect(resolveWritableBranch(admin, 'br-02')).toBe('br-02');
  });

  it('BRANCH_MANAGER is pinned to own branch', () => {
    expect(resolveWritableBranch(manager, undefined)).toBe('br-01');
    expect(resolveWritableBranch(manager, 'br-01')).toBe('br-01');
    expect(() => resolveWritableBranch(manager, 'br-02')).toThrow(ForbiddenException);
    expect(() => resolveWritableBranch(manager, 'global')).toThrow(ForbiddenException);
  });

  it('BRANCH_MANAGER without branch and other roles are rejected', () => {
    expect(() => resolveWritableBranch({ ...manager, branchId: null }, undefined)).toThrow(ForbiddenException);
    expect(() => resolveWritableBranch({ role: 'STAFF', userId: 's', branchId: 'br-01' }, 'br-01')).toThrow(
      ForbiddenException,
    );
  });

  it('assertCanManage only lets manager touch own branch records', () => {
    expect(() => assertCanManage(admin, null)).not.toThrow();
    expect(() => assertCanManage(manager, 'br-01')).not.toThrow();
    expect(() => assertCanManage(manager, null)).toThrow(ForbiddenException);
    expect(() => assertCanManage(manager, 'br-02')).toThrow(ForbiddenException);
  });

  it('isLive respects active flag and date window', () => {
    const now = new Date('2026-12-01T10:00:00Z');
    expect(isLive({ is_active: true, start_at: null, end_at: null }, now)).toBe(true);
    expect(isLive({ is_active: false, start_at: null, end_at: null }, now)).toBe(false);
    expect(isLive({ is_active: true, start_at: new Date('2026-12-02'), end_at: null }, now)).toBe(false);
    expect(isLive({ is_active: true, start_at: null, end_at: new Date('2026-11-30') }, now)).toBe(false);
  });
});

describe('StorefrontController', () => {
  let controller: StorefrontController;
  let bannerRepo: any;
  let sectionRepo: any;
  let itemRepo: any;
  let productRepo: any;
  let announcementRepo: any;
  let layoutRepo: any;

  beforeEach(() => {
    bannerRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => d),
      delete: jest.fn(async () => ({})),
      increment: jest.fn(async () => ({ affected: 1 })),
    };
    sectionRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => ({ id: 'sec-1', ...d })),
      delete: jest.fn(async () => ({})),
    };
    itemRepo = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => d),
      delete: jest.fn(async () => ({})),
    };
    productRepo = { find: jest.fn(async () => []) };
    announcementRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => d),
      delete: jest.fn(async () => ({})),
    };
    layoutRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((d) => ({ id: 'lay-1', ...d })),
      save: jest.fn(async (d) => d),
      delete: jest.fn(async () => ({})),
    };
    controller = new StorefrontController(bannerRepo, sectionRepo, itemRepo, productRepo, announcementRepo, layoutRepo);
  });

  it('manager creating a banner is forced to own branch', async () => {
    const result = await controller.createBanner(MANAGER_BR1, {
      title: 'Khai trương',
      image_url: '/uploads/a.jpg',
    } as any);
    expect(result.branch_id).toBe('br-01');
    expect(result.created_by).toBe('u-m1');
    expect(result.sort_order).toBe(0);
  });

  it('manager cannot create a global banner', async () => {
    await expect(
      controller.createBanner(MANAGER_BR1, { title: 'x', image_url: '/u.jpg', branch_id: 'global' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects start date after end date', async () => {
    await expect(
      controller.createBanner(ADMIN, {
        title: 'x',
        image_url: '/u.jpg',
        start_at: '2026-12-10T00:00:00Z',
        end_at: '2026-12-01T00:00:00Z',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('manager cannot edit a global banner', async () => {
    bannerRepo.findOne.mockResolvedValue({ id: 'b1', branch_id: null });
    await expect(controller.updateBanner(MANAGER_BR1, 'b1', { title: 'y' })).rejects.toThrow(ForbiddenException);
    await expect(controller.deleteBanner(MANAGER_BR1, 'b1')).rejects.toThrow(ForbiddenException);
  });

  it('reorder assigns sort_order by position', async () => {
    bannerRepo.find.mockResolvedValue([
      { id: 'b1', branch_id: 'br-01', sort_order: 0 },
      { id: 'b2', branch_id: 'br-01', sort_order: 1 },
    ]);
    await controller.reorderBanners(MANAGER_BR1, { ids: ['b2', 'b1'] });
    const saved = bannerRepo.save.mock.calls[0][0];
    expect(saved.map((b: any) => [b.id, b.sort_order])).toEqual([
      ['b2', 0],
      ['b1', 1],
    ]);
  });

  it('home puts branch banners first and drops expired ones', async () => {
    bannerRepo.find.mockResolvedValue([
      { id: 'g1', branch_id: null, sort_order: 0, is_active: true, start_at: null, end_at: null },
      { id: 'b1', branch_id: 'br-01', sort_order: 5, is_active: true, start_at: null, end_at: null },
      { id: 'old', branch_id: null, sort_order: 1, is_active: true, start_at: null, end_at: new Date('2000-01-01') },
    ]);
    const home = await controller.getHome('br-01');
    expect(home.banners.map((b: any) => b.id)).toEqual(['b1', 'g1']);
  });

  it('home uses branch section over global one and keeps item order', async () => {
    const product = (id: string) => ({ id, name: id });
    sectionRepo.find.mockResolvedValue([
      {
        id: 's-global',
        type: 'CSM_PICKS',
        branch_id: null,
        is_active: true,
        start_at: null,
        end_at: null,
        items: [{ sort_order: 0, note: null, product: product('p-global') }],
      },
      {
        id: 's-br',
        type: 'CSM_PICKS',
        branch_id: 'br-01',
        is_active: true,
        start_at: null,
        end_at: null,
        items: [
          { sort_order: 1, note: 'n2', product: product('p2') },
          { sort_order: 0, note: 'n1', product: product('p1') },
        ],
      },
    ]);
    const home = await controller.getHome('br-01');
    expect(home.sections.CSM_PICKS.id).toBe('s-br');
    expect(home.sections.CSM_PICKS.products.map((p: any) => [p.id, p.note])).toEqual([
      ['p1', 'n1'],
      ['p2', 'n2'],
    ]);
    expect(home.sections.FLASH_SALE).toBeNull();

    const globalHome = await controller.getHome(undefined);
    expect(globalHome.sections.CSM_PICKS.id).toBe('s-global');
  });

  it('home falls back to global section when branch section has no products', async () => {
    sectionRepo.find.mockResolvedValue([
      {
        id: 's-global',
        type: 'NEW_ARRIVALS',
        branch_id: null,
        is_active: true,
        start_at: null,
        end_at: null,
        items: [{ sort_order: 0, note: null, product: { id: 'p1' } }],
      },
      { id: 's-br', type: 'NEW_ARRIVALS', branch_id: 'br-01', is_active: true, start_at: null, end_at: null, items: [] },
    ]);
    const home = await controller.getHome('br-01');
    expect(home.sections.NEW_ARRIVALS.id).toBe('s-global');
  });

  it('upsertSection validates type, duplicates and unknown products', async () => {
    await expect(controller.upsertSection(ADMIN, 'BOGUS', { items: [] } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.upsertSection(ADMIN, 'FLASH_SALE', { items: [{ product_id: 'p1' }, { product_id: 'p1' }] } as any),
    ).rejects.toThrow(BadRequestException);
    productRepo.find.mockResolvedValue([]);
    await expect(
      controller.upsertSection(ADMIN, 'FLASH_SALE', { items: [{ product_id: 'p1' }] } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('upsertSection replaces items in given order for manager branch', async () => {
    productRepo.find.mockResolvedValue([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
    const result = await controller.upsertSection(MANAGER_BR1, 'flash_sale', {
      title: 'Giờ vàng',
      items: [{ product_id: 'p2' }, { product_id: 'p1', note: 'ngon' }],
    } as any);
    expect(sectionRepo.save.mock.calls[0][0]).toMatchObject({ type: 'FLASH_SALE', branch_id: 'br-01', title: 'Giờ vàng' });
    expect(itemRepo.delete).toHaveBeenCalledWith({ section_id: 'sec-1' });
    expect(result.products.map((p: any) => [p.id, p.note])).toEqual([
      ['p2', null],
      ['p1', 'ngon'],
    ]);
  });

  it('home splits banners by placement and only returns one popup', async () => {
    const mk = (id: string, placement: string, branch_id: string | null = null, sort_order = 0) => ({
      id, placement, branch_id, sort_order, is_active: true, start_at: null, end_at: null,
    });
    bannerRepo.find.mockResolvedValue([
      mk('hero', 'HOME_HERO'),
      mk('top', 'PRODUCTS_TOP'),
      mk('cart', 'CART'),
      mk('pop-global', 'POPUP', null, 0),
      mk('pop-branch', 'POPUP', 'br-01', 3),
    ]);
    const home = await controller.getHome('br-01');
    expect(home.banners.map((b: any) => b.id)).toEqual(['hero']);
    expect(home.placements.PRODUCTS_TOP.map((b: any) => b.id)).toEqual(['top']);
    expect(home.placements.CART.map((b: any) => b.id)).toEqual(['cart']);
    expect(home.placements.POPUP.map((b: any) => b.id)).toEqual(['pop-branch']);
  });

  it('home returns live announcements branch-first and branch layout over global', async () => {
    announcementRepo.find.mockResolvedValue([
      { id: 'a-global', branch_id: null, sort_order: 0, is_active: true, start_at: null, end_at: null },
      { id: 'a-branch', branch_id: 'br-01', sort_order: 9, is_active: true, start_at: null, end_at: null },
      { id: 'a-old', branch_id: null, sort_order: 1, is_active: true, start_at: null, end_at: new Date('2000-01-01') },
    ]);
    layoutRepo.find.mockResolvedValue([
      { branch_id: null, blocks: [{ key: 'TESTIMONIALS', visible: true }] },
      { branch_id: 'br-01', blocks: [{ key: 'SPIN_WHEEL', visible: false }] },
    ]);
    const home = await controller.getHome('br-01');
    expect(home.announcements.map((a: any) => a.id)).toEqual(['a-branch', 'a-global']);
    expect(home.layout![0]).toEqual({ key: 'SPIN_WHEEL', visible: false });
    expect(home.layout).toHaveLength(10);

    const globalHome = await controller.getHome(undefined);
    expect(globalHome.layout![0].key).toBe('TESTIMONIALS');
  });

  it('normalizeLayoutBlocks drops unknown/duplicate keys and appends missing ones', () => {
    const blocks = normalizeLayoutBlocks([
      { key: 'COMBO', visible: false },
      { key: 'COMBO', visible: true },
      { key: 'BOGUS' as any, visible: true },
    ]);
    expect(blocks[0]).toEqual({ key: 'COMBO', visible: false });
    expect(blocks).toHaveLength(10);
    expect(new Set(blocks.map((b) => b.key)).size).toBe(10);
  });

  it('banner click increments counter and 404s for unknown banner', async () => {
    await expect(controller.trackBannerClick('b1')).resolves.toEqual({ success: true });
    expect(bannerRepo.increment).toHaveBeenCalledWith({ id: 'b1' }, 'click_count', 1);
    bannerRepo.increment.mockResolvedValue({ affected: 0 });
    await expect(controller.trackBannerClick('nope')).rejects.toThrow(NotFoundException);
  });

  it('reorder refuses mixing placements', async () => {
    bannerRepo.find.mockResolvedValue([
      { id: 'b1', branch_id: 'br-01', placement: 'HOME_HERO', sort_order: 0 },
      { id: 'b2', branch_id: 'br-01', placement: 'CART', sort_order: 1 },
    ]);
    await expect(controller.reorderBanners(MANAGER_BR1, { ids: ['b2', 'b1'] })).rejects.toThrow(BadRequestException);
  });

  it('manager announcement is pinned to own branch; cannot edit global one', async () => {
    const created = await controller.createAnnouncement(MANAGER_BR1, { message: 'Freeship 100k' } as any);
    expect(created).toMatchObject({ branch_id: 'br-01', tone: 'primary', sort_order: 0 });
    announcementRepo.findOne.mockResolvedValue({ id: 'a1', branch_id: null });
    await expect(controller.updateAnnouncement(MANAGER_BR1, 'a1', { message: 'x' })).rejects.toThrow(ForbiddenException);
    await expect(controller.deleteAnnouncement(MANAGER_BR1, 'a1')).rejects.toThrow(ForbiddenException);
  });

  it('upsertLayout rejects duplicates and saves normalized blocks for manager branch', async () => {
    await expect(
      controller.upsertLayout(ADMIN, { blocks: [{ key: 'COMBO', visible: true }, { key: 'COMBO', visible: false }] } as any),
    ).rejects.toThrow(BadRequestException);
    const res = await controller.upsertLayout(MANAGER_BR1, { blocks: [{ key: 'SPIN_WHEEL', visible: false }] } as any);
    expect(res.branch_id).toBe('br-01');
    expect(res.blocks[0]).toEqual({ key: 'SPIN_WHEEL', visible: false });
    expect(layoutRepo.save.mock.calls[0][0]).toMatchObject({ branch_id: 'br-01', updated_by: 'u-m1' });
  });
});
