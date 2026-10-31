import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import {
  accountsRepo,
  categoriesRepo,
  snapshotsRepo,
  transactionsRepo,
} from './repositories';
import type { Transaction } from '@/lib/types';

/** 数据访问层查询契约（01 §5.5 周期统计、02 §4.4.6 重复判定、02 §5.4.3 趋势时序、02 §2.7 使用中账户） */

const tx = (id: string, date: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  date,
  direction: 'expense',
  amountCents: 1000,
  categoryId: null,
  accountId: null,
  counterAccountId: null,
  source: 'manual',
  memo: '食堂午饭',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('transactionsRepo.byDateRange（01 §5.5 周期统计边界）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('闭区间 [startDate, endDate]：边界日期计入，区间外不计入', async () => {
    await transactionsRepo.save(tx('a', '2026-01-01'));
    await transactionsRepo.save(tx('b', '2026-01-15'));
    await transactionsRepo.save(tx('c', '2026-01-31'));
    await transactionsRepo.save(tx('d', '2026-02-01'));

    const result = await transactionsRepo.byDateRange('2026-01-01', '2026-01-31');
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('transactionsRepo.findByDateAmountMemo（02 §4.4.6 疑似重复判定）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('同日期+同金额+同描述命中，任一不同不命中', async () => {
    await transactionsRepo.save(tx('a', '2026-03-01', { amountCents: 1250, originalMemo: '食堂午饭' }));
    await transactionsRepo.save(tx('b', '2026-03-01', { amountCents: 1250, originalMemo: '超市购物' }));
    await transactionsRepo.save(tx('c', '2026-03-02', { amountCents: 1250, originalMemo: '食堂午饭' }));
    await transactionsRepo.save(tx('d', '2026-03-01', { amountCents: 999, originalMemo: '食堂午饭' }));

    const hit = await transactionsRepo.findByDateAmountMemo('2026-03-01', 1250, '食堂午饭');
    expect(hit.map((t) => t.id)).toEqual(['a']);
  });

  it('无原始描述时回退到备注比对', async () => {
    await transactionsRepo.save(tx('a', '2026-03-01', { amountCents: 1250, memo: '食堂午饭' }));
    const hit = await transactionsRepo.findByDateAmountMemo('2026-03-01', 1250, '食堂午饭');
    expect(hit.map((t) => t.id)).toEqual(['a']);
  });
});

describe('accountsRepo.active（02 §2.7 使用中账户）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('软删除账户不出现在使用中列表', async () => {
    const created = await accountsRepo.add({ name: '余额宝', assetType: 'cash', includeInTotal: true });
    expect((await accountsRepo.active()).map((a) => a.id)).toEqual([created.id]);
    await accountsRepo.save({ ...created, deletedAt: '2026-01-02T00:00:00.000Z' });
    expect(await accountsRepo.active()).toEqual([]);
    // 软删除后记录本身仍可取回（供收支记录显示原账户名，02 §2.4.7）
    expect((await accountsRepo.get(created.id))?.name).toBe('余额宝');
  });
});

describe('snapshotsRepo.allOrdered（02 §5.4.3 趋势时序）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('按快照时间升序返回', async () => {
    const base = { entries: [], totalCents: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null };
    await snapshotsRepo.save({ ...base, id: 's2', takenAt: '2026-01-08T10:00:00.000Z' });
    await snapshotsRepo.save({ ...base, id: 's1', takenAt: '2026-01-01T10:00:00.000Z' });
    const ordered = await snapshotsRepo.allOrdered();
    expect(ordered.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('categoriesRepo.byDirection（03 §3 展示顺序）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('按 sortOrder 升序返回指定方向的分类', async () => {
    await categoriesRepo.save({
      id: 'c2', name: '学习', direction: 'expense', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 1,
    });
    await categoriesRepo.save({
      id: 'c1', name: '餐饮', direction: 'expense', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 0,
    });
    await categoriesRepo.save({
      id: 'c3', name: '生活费', direction: 'income', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 2,
    });
    const expense = await categoriesRepo.byDirection('expense');
    expect(expense.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
