import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeCurrentTotalCents,
  computeSnapshotTotalCents,
  daysUntil,
  findLatestEntry,
  fundAmountCents,
  isLargeChange,
  sameMinuteKey,
  trendPoints,
} from './assets';
import type { Account, AssetSnapshot } from './types';

const account = (id: string, overrides: Partial<Account> = {}): Account => ({
  id,
  name: id,
  assetType: 'cash',
  includeInTotal: true,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const snapshot = (
  id: string,
  takenAt: string,
  entries: Array<[string, number]>,
  totalCents: number,
): AssetSnapshot => ({
  id,
  takenAt,
  entries: entries.map(([accountId, balanceCents]) => ({ accountId, balanceCents })),
  totalCents,
  createdAt: takenAt,
  updatedAt: null,
});

describe('addDays / daysUntil', () => {
  it('存入日期 + 期限 = 到期日（02 §2.6.2）', () => {
    expect(addDays('2026-01-01', 90)).toBe('2026-04-01');
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });

  it('剩余天数与已到期', () => {
    expect(daysUntil('2026-01-10', '2026-01-01')).toBe(9);
    expect(daysUntil('2025-12-01', '2026-01-01')).toBe(-31);
    expect(daysUntil('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('fundAmountCents', () => {
  it('金额 = 份额 × 净值（02 §3.4.1 方式 A）', () => {
    expect(fundAmountCents(100, 1.2345)).toBe(12345);
    expect(fundAmountCents(0, 1.5)).toBe(0);
  });
});

describe('computeSnapshotTotalCents', () => {
  it('只合计计入总资产的账户（02 §3.6）', () => {
    const entries = [
      { accountId: 'a', balanceCents: 1000 },
      { accountId: 'b', balanceCents: 2000 },
    ];
    expect(computeSnapshotTotalCents(entries, new Set(['a', 'b']))).toBe(3000);
    expect(computeSnapshotTotalCents(entries, new Set(['a']))).toBe(1000);
    expect(computeSnapshotTotalCents(entries, new Set())).toBe(0);
  });
});

describe('computeCurrentTotalCents（02 §5.4.1）', () => {
  const snaps = [
    snapshot('s1', '2026-01-01T10:00:00.000Z', [['a', 100], ['b', 200]], 300),
    snapshot('s2', '2026-01-08T10:00:00.000Z', [['a', 150], ['b', 250]], 400),
  ];

  it('取最近一次快照余额求和', () => {
    expect(computeCurrentTotalCents([account('a'), account('b')], snaps)).toBe(400);
  });

  it('无快照的账户不计入（不按 0 计）', () => {
    expect(computeCurrentTotalCents([account('a'), account('c')], snaps)).toBe(150);
  });

  it('不计入总资产的账户不参与合计', () => {
    expect(
      computeCurrentTotalCents([account('a'), account('b', { includeInTotal: false })], snaps),
    ).toBe(150);
  });

  it('已删除账户不参与合计', () => {
    expect(
      computeCurrentTotalCents([account('a'), account('b', { deletedAt: '2026-01-09' })], snaps),
    ).toBe(150);
  });

  it('全部账户无快照时为 0', () => {
    expect(computeCurrentTotalCents([account('c')], snaps)).toBe(0);
  });
});

describe('findLatestEntry', () => {
  it('返回最近一次快照中的账户值', () => {
    const snaps = [
      snapshot('s1', '2026-01-01T10:00:00.000Z', [['a', 100]], 100),
      snapshot('s2', '2026-01-08T10:00:00.000Z', [['a', 150]], 150),
    ];
    const result = findLatestEntry(snaps, 'a');
    expect(result?.entry.balanceCents).toBe(150);
    expect(findLatestEntry(snaps, 'z')).toBeNull();
  });

  it('账户在中间快照缺失时回溯更早的值', () => {
    const snaps = [
      snapshot('s1', '2026-01-01T10:00:00.000Z', [['a', 100]], 100),
      snapshot('s2', '2026-01-08T10:00:00.000Z', [['b', 150]], 150),
    ];
    expect(findLatestEntry(snaps, 'a')?.entry.balanceCents).toBe(100);
  });
});

describe('isLargeChange（02 §3.4.3 ±50%）', () => {
  it('超过 ±50% 判定为大幅变化', () => {
    expect(isLargeChange(1000, 1600)).toBe(true);
    expect(isLargeChange(1000, 400)).toBe(true);
    expect(isLargeChange(1000, 1500)).toBe(false);
    expect(isLargeChange(1000, 500)).toBe(false);
  });

  it('首次录入或上次为 0 不判定', () => {
    expect(isLargeChange(null, 9999)).toBe(false);
    expect(isLargeChange(0, 9999)).toBe(false);
  });
});

describe('trendPoints（02 §5.4.3）', () => {
  const snaps = [
    snapshot('s1', '2025-11-01T10:00:00.000Z', [['a', 100]], 100),
    snapshot('s2', '2026-01-15T10:00:00.000Z', [['a', 200]], 200),
    snapshot('s3', '2026-03-10T10:00:00.000Z', [['a', 300]], 300),
  ];
  const now = '2026-03-15T10:00:00.000Z';

  it('默认全部', () => {
    expect(trendPoints(snaps, 'all', now)).toHaveLength(3);
  });

  it('近 1 个月过滤', () => {
    const points = trendPoints(snaps, '1m', now);
    expect(points.map((p) => p.totalCents)).toEqual([300]);
  });

  it('近 3 个月过滤', () => {
    const points = trendPoints(snaps, '3m', now);
    expect(points.map((p) => p.totalCents)).toEqual([200, 300]);
  });
});

describe('sameMinuteKey', () => {
  it('同一分钟的快照冲突判定', () => {
    expect(sameMinuteKey('2026-01-01T10:05:30.000Z')).toBe('2026-01-01T10:05');
    expect(sameMinuteKey('2026-01-01T10:05:59.000Z')).toBe('2026-01-01T10:05');
  });
});
