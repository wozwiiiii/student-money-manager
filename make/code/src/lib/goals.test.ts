import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareGoals,
  derivedStatus,
  diffDays,
  goalProgressPct,
  isGoalReached,
  isOverdue,
  paceForecast,
  remainingDays,
  savedCentsOf,
  validateEntryAmount,
  validateGoalDate,
  validateGoalName,
  validateTargetCents,
  validateWithdraw,
} from './goals';
import type { GoalEntry, SavingsGoal } from './types';

const entry = (goalId: string, type: GoalEntry['type'], amountCents: number, date: string): GoalEntry => ({
  id: `${goalId}-${date}-${type}-${amountCents}`,
  goalId,
  type,
  amountCents,
  date,
  createdAt: date,
});

const goal = (patch: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'g1',
  name: '换数码设备',
  targetCents: 100000,
  deadline: '2026-12-31',
  status: 'active',
  archived: false,
  linkedAccountIds: [],
  createdAt: '2026-09-01',
  updatedAt: '2026-09-01',
  ...patch,
});

describe('已储蓄金额（04 §2.4 手动累计式）', () => {
  it('已储蓄 = 存入合计 − 取出合计，且只统计本目标', () => {
    const entries = [
      entry('g1', 'deposit', 30000, '2026-09-01'),
      entry('g1', 'deposit', 20000, '2026-09-15'),
      entry('g1', 'withdraw', 5000, '2026-09-20'),
      entry('g2', 'deposit', 99999, '2026-09-10'),
    ];
    expect(savedCentsOf('g1', entries)).toBe(45000);
    expect(savedCentsOf('g2', entries)).toBe(99999);
    expect(savedCentsOf('g3', entries)).toBe(0);
  });
});

describe('进度百分比（04 §2.4）', () => {
  it('向下取整，不四舍五入', () => {
    // 99.6% 展示为 99%
    expect(goalProgressPct(99600, 100000)).toBe(99);
    expect(goalProgressPct(50000, 100000)).toBe(50);
  });

  it('仅达成时展示 100%，超额封顶 100%', () => {
    expect(goalProgressPct(99999, 100000)).toBe(99);
    expect(goalProgressPct(100000, 100000)).toBe(100);
    expect(goalProgressPct(150000, 100000)).toBe(100);
    expect(isGoalReached(150000, 100000)).toBe(true);
    expect(isGoalReached(99999, 100000)).toBe(false);
  });

  it('目标金额为 0 时不产生进度', () => {
    expect(goalProgressPct(1000, 0)).toBe(0);
    expect(isGoalReached(1000, 0)).toBe(false);
  });
});

describe('剩余天数（04 §2.4）', () => {
  it('剩余 N 天 / 今日截止 / 已到期 N 天', () => {
    expect(remainingDays('2026-11-10', '2026-11-01')).toBe(9);
    expect(remainingDays('2026-11-01', '2026-11-01')).toBe(0);
    expect(remainingDays('2026-10-28', '2026-11-01')).toBe(-4);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
    expect(addDays('2026-10-31', 3)).toBe('2026-11-03');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('逾期判定：进行中且已过目标日期且未达成（04 §2.5）', () => {
    const g = goal({ deadline: '2026-10-01' });
    expect(isOverdue(g, 50000, '2026-11-01')).toBe(true);
    expect(isOverdue(g, 100000, '2026-11-01')).toBe(false); // 已达成不算逾期
    expect(isOverdue(goal({ deadline: '2026-10-01', status: 'abandoned' }), 50000, '2026-11-01')).toBe(false);
    expect(isOverdue(g, 50000, '2026-09-30')).toBe(false);
  });
});

describe('完成预期提示（04 §2.4）', () => {
  it('记录不足 2 条或首条未满 7 天 → 展示前提不满足', () => {
    const g = goal();
    expect(paceForecast(g, [], '2026-11-01')).toEqual({ kind: 'insufficient' });
    expect(paceForecast(g, [entry('g1', 'deposit', 10000, '2026-10-30')], '2026-11-01')).toEqual({
      kind: 'insufficient',
    });
    // 2 条记录但首条距今不足 7 天
    const entries = [
      entry('g1', 'deposit', 10000, '2026-10-28'),
      entry('g1', 'deposit', 10000, '2026-11-01'),
    ];
    expect(paceForecast(g, entries, '2026-11-01')).toEqual({ kind: 'insufficient' });
  });

  it('每周平均存入 = 净额 ÷ 经过周数（向上取整、至少 1）', () => {
    // 首条 2026-10-01，今天 2026-10-15：经过 14 天 → 2 周；净额 20000 → 每周 10000
    const entries = [
      entry('g1', 'deposit', 15000, '2026-10-01'),
      entry('g1', 'deposit', 10000, '2026-10-08'),
      entry('g1', 'withdraw', 5000, '2026-10-10'),
    ];
    const result = paceForecast(goal(), entries, '2026-10-15');
    expect(result.kind).toBe('onTrack');
    if (result.kind === 'onTrack') {
      expect(result.weeklyAvgCents).toBe(10000);
      // 剩余 80000 ÷ 每周 10000 × 7 = 56 天 → 2026-12-10，早于 2026-12-31
      expect(result.etaDate).toBe('2026-12-10');
    }
  });

  it('预计达成晚于目标日期 → 提示晚 N 天与每周需存金额', () => {
    // 首条 2026-10-01，今天 2026-10-15：净额 2000 → 每周 1000；剩余 98000 需 686 天
    const entries = [
      entry('g1', 'deposit', 1200, '2026-10-01'),
      entry('g1', 'deposit', 800, '2026-10-08'),
    ];
    const result = paceForecast(goal(), entries, '2026-10-15');
    expect(result.kind).toBe('late');
    if (result.kind === 'late') {
      // 剩余 98000 ÷ 每周 1000 × 7 = 686 天 → 2028-08-31，晚于 2026-12-31
      expect(result.etaDate).toBe('2028-08-31');
      expect(result.lateDays).toBe(diffDays('2026-12-31', '2028-08-31'));
      // 剩余周数 = ceil(77/7) = 11 → 每周需存 98000 ÷ 11
      expect(result.requiredWeeklyCents).toBeCloseTo(98000 / 11, 5);
    }
  });

  it('净取出导致每周平均 ≤ 0 → 展示前提不满足', () => {
    const entries = [
      entry('g1', 'deposit', 5000, '2026-10-01'),
      entry('g1', 'withdraw', 5000, '2026-10-08'),
    ];
    expect(paceForecast(goal(), entries, '2026-10-15')).toEqual({ kind: 'insufficient' });
  });

  it('目标已达成 → 不展示达成预期', () => {
    const entries = [
      entry('g1', 'deposit', 60000, '2026-10-01'),
      entry('g1', 'deposit', 60000, '2026-10-08'),
    ];
    expect(paceForecast(goal(), entries, '2026-10-15')).toEqual({ kind: 'achieved' });
  });
});

describe('主列表排序（04 §2.2）', () => {
  it('逾期置顶 → 进行中按日期从近到远 → 已达成/已放弃沉底', () => {
    const overdue = goal({ id: 'overdue', deadline: '2026-10-01' });
    const near = goal({ id: 'near', deadline: '2026-11-30' });
    const far = goal({ id: 'far', deadline: '2027-06-30' });
    const done = goal({ id: 'done', deadline: '2026-11-05', status: 'achieved' });
    const givenUp = goal({ id: 'givenUp', deadline: '2026-11-06', status: 'abandoned' });
    const sorted = [done, far, overdue, givenUp, near]
      .slice()
      .sort((a, b) => compareGoals(a, b, '2026-11-01', []))
      .map((g) => g.id);
    expect(sorted).toEqual(['overdue', 'near', 'far', 'done', 'givenUp']);
  });
});

describe('状态推导（04 §2.5）', () => {
  it('进行中 ↔ 已达成自动迁移；已放弃仅用户操作', () => {
    expect(derivedStatus(goal(), 100000)).toBe('achieved');
    expect(derivedStatus(goal(), 99999)).toBe('active');
    // 目标金额上调后重开
    expect(derivedStatus(goal({ status: 'achieved' }), 50000)).toBe('active');
    // 已放弃不自动迁移
    expect(derivedStatus(goal({ status: 'abandoned' }), 200000)).toBe('abandoned');
  });
});

describe('校验（04 §2.7）', () => {
  it('目标名称 1～20 字', () => {
    expect(validateGoalName('')).not.toBeNull();
    expect(validateGoalName('换数码设备')).toBeNull();
    expect(validateGoalName('字'.repeat(21))).not.toBeNull();
  });

  it('目标金额必须大于 0', () => {
    expect(validateTargetCents(null)).toBe('目标金额必须大于 0');
    expect(validateTargetCents(0)).toBe('目标金额必须大于 0');
    expect(validateTargetCents(-100)).toBe('目标金额必须大于 0');
    expect(validateTargetCents(1)).toBeNull();
  });

  it('目标日期：创建时不得早于今天；编辑逾期目标保留原值可通过', () => {
    expect(validateGoalDate('2026-11-01', '2026-11-01')).toBeNull();
    expect(validateGoalDate('2026-10-31', '2026-11-01')).toBe('目标日期不能早于今天');
    // 编辑逾期目标未修改日期（原值为过去日期）→ 允许保存
    expect(validateGoalDate('2026-10-01', '2026-11-01', '2026-10-01')).toBeNull();
    // 改为另一个早于今天的新值 → 阻止
    expect(validateGoalDate('2026-09-01', '2026-11-01', '2026-10-01')).toBe('目标日期不能早于今天');
  });

  it('记录金额必须大于 0；取出不得使累计为负', () => {
    expect(validateEntryAmount(0)).toBe('金额必须大于 0');
    expect(validateEntryAmount(1)).toBeNull();
    expect(validateWithdraw(5000, 5000)).toBeNull();
    expect(validateWithdraw(5000, 5001)).toBe('取出金额不能超过当前已储蓄金额');
  });
});
