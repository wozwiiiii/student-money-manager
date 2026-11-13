import { describe, expect, it } from 'vitest';
import {
  budgetProgress,
  buildWarnings,
  categorySlices,
  cycleStatus,
  dismissRecord,
  inPeriod,
  isWarningDismissed,
  monthBounds,
  periodStats,
  recordsInPeriod,
} from './stats';
import type { Category, CustomCycle, Transaction } from './types';

const tx = (date: string, direction: Transaction['direction'], amountCents: number, categoryId: string | null): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date,
  direction,
  amountCents,
  categoryId,
  accountId: null,
  counterAccountId: null,
  source: 'manual',
  createdAt: date,
  updatedAt: date,
});

describe('周期边界（01 §5.5、03 §4.3）', () => {
  it('月度周期为自然月', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthBounds('2026-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('记录计入每一个包含其日期的周期', () => {
    expect(inPeriod('2026-09-15', { start: '2026-09-01', end: '2027-01-15' })).toBe(true);
    expect(inPeriod('2026-08-31', { start: '2026-09-01', end: '2027-01-15' })).toBe(false);
  });

  it('自定义周期状态（03 §4.2）', () => {
    const cycle: CustomCycle = {
      id: 'c1', name: '秋季学期', startDate: '2026-09-01', endDate: '2027-01-15', ended: false, createdAt: '',
    };
    expect(cycleStatus(cycle, '2026-08-01')).toBe('upcoming');
    expect(cycleStatus(cycle, '2026-10-01')).toBe('active');
    expect(cycleStatus(cycle, '2027-02-01')).toBe('ended');
  });
});

describe('periodStats（03 §2.3）', () => {
  it('收入/支出/结余；转账不计入', () => {
    const txs = [
      tx('2026-10-01', 'income', 150000, 'i1'),
      tx('2026-10-02', 'expense', 1250, 'c1'),
      tx('2026-10-03', 'expense', 2500, 'c2'),
      tx('2026-10-04', 'transfer', 99999, null),
    ];
    const stats = periodStats(txs);
    expect(stats.incomeCents).toBe(150000);
    expect(stats.expenseCents).toBe(3750);
    expect(stats.balanceCents).toBe(146250);
  });

  it('recordsInPeriod 按周期过滤', () => {
    const txs = [tx('2026-09-30', 'expense', 100, 'c1'), tx('2026-10-01', 'expense', 200, 'c1')];
    expect(recordsInPeriod(txs, monthBounds('2026-10'))).toHaveLength(1);
  });
});

describe('categorySlices（03 §6.1）', () => {
  const categories: Category[] = [
    { id: 'l1', name: '餐饮', direction: 'expense', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 0 },
    { id: 'l1c', name: '食堂', direction: 'expense', parentId: 'l1', level: 2, builtin: true, disabled: false, sortOrder: 1 },
    { id: 'l2', name: '交通', direction: 'expense', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 2 },
    { id: 'i1', name: '生活费', direction: 'income', parentId: null, level: 1, builtin: true, disabled: false, sortOrder: 3 },
  ];

  it('二级并入一级、按金额降序、含百分比', () => {
    const txs = [
      tx('2026-10-01', 'expense', 3000, 'l1c'), // 食堂 → 餐饮
      tx('2026-10-02', 'expense', 1000, 'l1'),
      tx('2026-10-03', 'expense', 2000, 'l2'),
      tx('2026-10-04', 'income', 9999, 'i1'), // 收入不计入支出占比
      tx('2026-10-05', 'transfer', 8888, null),
    ];
    const slices = categorySlices(txs, categories, 'expense');
    expect(slices[0]).toMatchObject({ categoryId: 'l1', name: '餐饮', amountCents: 4000, percent: 67 });
    expect(slices[1]).toMatchObject({ categoryId: 'l2', amountCents: 2000, percent: 33 });
  });

  it('分类已不存在归入「未分类」', () => {
    const slices = categorySlices([tx('2026-10-01', 'expense', 100, 'gone')], categories, 'expense');
    expect(slices[0].name).toBe('未分类');
  });
});

describe('budgetProgress（03 §4.1、§5.3）', () => {
  it('正常 / 接近超支 / 已超支梯度', () => {
    expect(budgetProgress(5000, 10000, 80).level).toBe('normal');
    expect(budgetProgress(8000, 10000, 80).level).toBe('warning');
    expect(budgetProgress(9999, 10000, 80).level).toBe('warning');
    expect(budgetProgress(10000, 10000, 80).level).toBe('overspend');
    expect(budgetProgress(12000, 10000, 80).level).toBe('overspend');
  });

  it('金额口径：剩余/超支/百分比', () => {
    const view = budgetProgress(9000, 10000, 80);
    expect(view.remainingCents).toBe(1000);
    expect(view.overspendCents).toBe(-1000);
    expect(view.percent).toBe(90);
  });

  it('阈值可调（05 §5.1 预警阈值默认 80%）', () => {
    expect(budgetProgress(6000, 10000, 50).level).toBe('warning');
    expect(budgetProgress(6000, 10000, 95).level).toBe('normal');
  });
});

describe('buildWarnings（03 §5.4 文案模板）', () => {
  it('文案与排序：已超支优先、总预算优先', () => {
    const warnings = buildWarnings(
      '本月',
      budgetProgress(12000, 10000, 80),
      [{ categoryId: 'c1', name: '餐饮', view: budgetProgress(9000, 10000, 80) }],
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ key: 'total', level: 'overspend' });
    expect(warnings[0].message).toBe('本月总预算已超支 ¥20.00');
    expect(warnings[1].message).toBe('「餐饮」本月预算已使用 90%，剩余 ¥10.00');
  });

  it('正常项不出现在提示中', () => {
    expect(buildWarnings('本月', budgetProgress(100, 10000, 80), [])).toHaveLength(0);
  });

  it('梯度优先于范围：分类已超支排在总预算接近超支之前（03 §5.4 排序）', () => {
    const warnings = buildWarnings(
      '本月',
      budgetProgress(9000, 10000, 80), // 总预算：接近超支
      [{ categoryId: 'c1', name: '餐饮', view: budgetProgress(12000, 10000, 80) }], // 分类：已超支
    );
    expect(warnings.map((w) => w.key)).toEqual(['cat:c1', 'total']);
  });
});

describe('提示条关闭后的重现规则（05 §5.1）', () => {
  const today = '2026-11-01';
  const cycle = '2026-11';

  it('B（默认）：当日关闭不重现，次日重新评估；梯度升级立即重现（03 §5.6）', () => {
    const record = dismissRecord('2026-11-01', 'warning', cycle);
    expect(isWarningDismissed(record, 'B', 'warning', today, cycle)).toBe(true);
    expect(isWarningDismissed(record, 'B', 'warning', '2026-11-02', cycle)).toBe(false);
    expect(isWarningDismissed(record, 'B', 'overspend', today, cycle)).toBe(false);
  });

  it('A：本周期内保持隐藏，梯度升级时重现，跨周期重现', () => {
    const record = dismissRecord('2026-11-01', 'warning', cycle);
    expect(isWarningDismissed(record, 'A', 'warning', '2026-11-20', cycle)).toBe(true);
    expect(isWarningDismissed(record, 'A', 'overspend', '2026-11-20', cycle)).toBe(false);
    expect(isWarningDismissed(record, 'A', 'warning', '2026-12-05', '2026-12')).toBe(false);
  });

  it('C：本周期内不再重现（含梯度升级，[对齐 TBD]）', () => {
    const record = dismissRecord('2026-11-01', 'warning', cycle);
    expect(isWarningDismissed(record, 'C', 'warning', '2026-11-20', cycle)).toBe(true);
    expect(isWarningDismissed(record, 'C', 'overspend', '2026-11-20', cycle)).toBe(true);
    expect(isWarningDismissed(record, 'C', 'overspend', '2026-12-05', '2026-12')).toBe(false);
  });

  it('无关闭记录、旧格式记录的处理', () => {
    expect(isWarningDismissed(undefined, 'B', 'warning', today, cycle)).toBe(false);
    // 旧格式「日期|梯度」：按 B 规则处理
    const legacy = '2026-11-01|warning';
    expect(isWarningDismissed(legacy, 'B', 'warning', today, cycle)).toBe(true);
    expect(isWarningDismissed(legacy, 'B', 'warning', '2026-11-02', cycle)).toBe(false);
  });
});
