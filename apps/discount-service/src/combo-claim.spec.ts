import { DiscountService } from './discount.service';
import { Combo } from './entities/combo.entity';

/**
 * FE#25: hai khách đặt cùng lúc suất combo cuối cùng -> chỉ một người giữ được.
 *
 * DataSource giả mô phỏng khoá dòng (SELECT ... FOR UPDATE) của MySQL: transaction nào khoá
 * dòng combo trước thì transaction sau phải chờ tới khi transaction trước commit.
 */
function createLockingDataSource(rows: Map<string, Combo>) {
  const waiters = new Map<string, Promise<void>>();

  return {
    transaction: async (cb: (manager: any) => Promise<any>) => {
      const held: Array<() => void> = [];
      const staged = new Map<string, Combo>();
      const manager = {
        getRepository: () => ({
          createQueryBuilder: () => {
            let id = '';
            const qb: any = {
              setLock: () => qb,
              where: (_sql: string, params: { id: string }) => {
                id = params.id;
                return qb;
              },
              getOne: async () => {
                // Chờ transaction đang giữ khoá dòng này commit xong
                while (waiters.has(id)) await waiters.get(id);
                let release!: () => void;
                waiters.set(id, new Promise<void>((r) => (release = r)));
                held.push(() => {
                  waiters.delete(id);
                  release();
                });
                // Nhường lượt để transaction khác chạy xen kẽ (mô phỏng đặt hàng đồng thời)
                await new Promise((r) => setTimeout(r, 5));
                const row = rows.get(id);
                return row ? { ...row } : null;
              },
            };
            return qb;
          },
        }),
        save: async (entity: Combo) => {
          staged.set(entity.id, entity);
          return entity;
        },
      };
      try {
        const result = await cb(manager);
        staged.forEach((v, k) => rows.set(k, v)); // commit
        return result;
      } finally {
        held.forEach((fn) => fn());
      }
    },
  };
}

const buildService = (rows: Map<string, Combo>) =>
  new DiscountService(
    {} as any,
    {} as any,
    createLockingDataSource(rows) as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

const comboRow = (overrides: Partial<Combo> = {}): Combo =>
  ({
    id: 'combo-1',
    name: 'Combo Sáng',
    is_active: true,
    start_date: null,
    end_date: null,
    max_quantity: 5,
    sold_count: 4, // còn đúng 1 suất
    ...overrides,
  }) as any;

describe('Giữ suất combo khi đặt hàng đồng thời (FE#25)', () => {
  it('Hai khách cùng đặt suất combo cuối -> đúng 1 người giữ được, sold_count không vượt max_quantity', async () => {
    const rows = new Map([['combo-1', comboRow()]]);
    const service = buildService(rows);

    const results = await Promise.allSettled([
      service.claimComboPurchases([{ comboId: 'combo-1', quantity: 1 }]),
      service.claimComboPurchases([{ comboId: 'combo-1', quantity: 1 }]),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason?.message)).toContain('vừa hết suất');
    expect(rows.get('combo-1')!.sold_count).toBe(5);
  });

  it('10 khách tranh 3 suất -> đúng 3 người thành công', async () => {
    const rows = new Map([['combo-1', comboRow({ max_quantity: 3, sold_count: 0 })]]);
    const service = buildService(rows);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.claimComboPurchases([{ comboId: 'combo-1', quantity: 1 }])),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(rows.get('combo-1')!.sold_count).toBe(3);
  });

  it('Đơn có 2 combo, một combo hết suất -> không giữ combo nào (tất cả hoặc không)', async () => {
    const rows = new Map([
      ['combo-a', comboRow({ id: 'combo-a', max_quantity: 10, sold_count: 0 })],
      ['combo-b', comboRow({ id: 'combo-b', name: 'Combo Trưa', max_quantity: 1, sold_count: 1 })],
    ]);
    const service = buildService(rows);

    await expect(
      service.claimComboPurchases([
        { comboId: 'combo-a', quantity: 1 },
        { comboId: 'combo-b', quantity: 1 },
      ]),
    ).rejects.toThrow('Combo Trưa');
    expect(rows.get('combo-a')!.sold_count).toBe(0);
  });

  it('Combo không giới hạn suất hoặc đang tạm ngưng', async () => {
    const rows = new Map([
      ['free', comboRow({ id: 'free', max_quantity: null as any, sold_count: 100 })],
      ['off', comboRow({ id: 'off', is_active: false })],
    ]);
    const service = buildService(rows);
    await expect(service.claimComboPurchases([{ comboId: 'free', quantity: 3 }])).resolves.toMatchObject({
      success: true,
    });
    await expect(service.claimComboPurchases([{ comboId: 'off', quantity: 1 }])).rejects.toThrow('tạm ngưng');
  });
});
