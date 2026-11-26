import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
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

  beforeEach(() => {
    bannerRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => d),
      delete: jest.fn(async () => ({})),
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
    controller = new StorefrontController(bannerRepo, sectionRepo, itemRepo, productRepo);
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
});
