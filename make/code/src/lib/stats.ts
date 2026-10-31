import type { Budget, Category, CustomCycle, Transaction } from './types';
import { progressPercent, sumCents } from './money';

/**
 * 周期统计与预算进度纯函数（03 §4、§5、§6 口径）。
 * - 记录按日期归入每一个包含其日期的周期，各周期独立统计（01 §5.5）
 * - 转账不计入收支统计（01 §5.3）；预算只约束支出（03 §4）
 * - 已支出 = 周期内现存支出记录之和，实时计算、不保留中间结果（03 §4.1）
 */

export interface PeriodBounds {
  /** YYYY-MM-DD，闭区间 */
  start: string;
  end: string;
}

/** 月度周期边界（自然月，01 §5.5） */
export function monthBounds(monthKey: string): PeriodBounds {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

/** 自定义周期边界（03 §4.2） */
export function customCycleBounds(cycle: CustomCycle): PeriodBounds {
  return { start: cycle.startDate, end: cycle.endDate };
}

/** 自定义周期状态（03 §4.2） */
export function cycleStatus(cycle: CustomCycle, todayStr: string): 'upcoming' | 'active' | 'ended' {
  if (todayStr < cycle.startDate) return 'upcoming';
  if (todayStr > cycle.endDate) return 'ended';
  return 'active';
}

/** 日期是否落在周期区间内（03 §4.3） */
export function inPeriod(date: string, bounds: PeriodBounds): boolean {
  return date >= bounds.start && date <= bounds.end;
}

export function recordsInPeriod(transactions: Transaction[], bounds: PeriodBounds): Transaction[] {
  return transactions.filter((t) => inPeriod(t.date, bounds));
}

export interface PeriodStats {
  incomeCents: number;
  expenseCents: number;
  /** 结余 = 收入 − 支出，可为负（03 §2.3） */
  balanceCents: number;
}

export function periodStats(transactions: Transaction[]): PeriodStats {
  const incomeCents = sumCents(
    transactions.filter((t) => t.direction === 'income').map((t) => t.amountCents),
  );
  const expenseCents = sumCents(
    transactions.filter((t) => t.direction === 'expense').map((t) => t.amountCents),
  );
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
}

export interface CategorySlice {
  /** 一级分类 id */
  categoryId: string;
  name: string;
  amountCents: number;
  percent: number;
}

/**
 * 分类聚合（03 §6.1）：按一级分类聚合指定方向的金额，金额为零的分类不出现；按金额降序。
 * 二级记录并入其一级；分类已不存在时归入「未分类」桶（不虚构分类）。
 */
export function categorySlices(
  transactions: Transaction[],
  categories: Category[],
  direction: 'expense' | 'income',
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.direction !== direction) continue;
    const category = t.categoryId ? byId.get(t.categoryId) : undefined;
    const l1 = category ? (category.level === 1 ? category.id : (category.parentId ?? category.id)) : '__unknown__';
    totals.set(l1, (totals.get(l1) ?? 0) + t.amountCents);
  }
  const all = sumCents([...totals.values()]);
  const slices: CategorySlice[] = [];
  for (const [id, amountCents] of totals) {
    if (amountCents === 0) continue;
    const category = byId.get(id);
    slices.push({
      categoryId: id,
      name: category?.name ?? '未分类',
      amountCents,
      percent: all > 0 ? Math.round((amountCents / all) * 100) : 0,
    });
  }
  return slices.sort((a, b) => b.amountCents - a.amountCents);
}

export type BudgetLevel = 'normal' | 'warning' | 'overspend';

export interface BudgetProgressView {
  budgetCents: number;
  spentCents: number;
  /** 展示百分比四舍五入取整（03 §4.1） */
  percent: number;
  remainingCents: number;
  overspendCents: number;
  level: BudgetLevel;
}

/**
 * 预算进度（03 §4.1、§5.3）：
 * - 进度 = 已支出 ÷ 预算金额；剩余可用 = 预算 − 已支出；超支金额 = 已支出 − 预算
 * - 梯度：进度 ≥ 阈值且 < 100% 接近超支；≥ 100% 已超支
 */
export function budgetProgress(
  spentCents: number,
  budgetCents: number,
  thresholdPct: number,
): BudgetProgressView {
  const ratio = budgetCents > 0 ? spentCents / budgetCents : 0;
  const level: BudgetLevel = ratio >= 1 ? 'overspend' : ratio * 100 >= thresholdPct ? 'warning' : 'normal';
  return {
    budgetCents,
    spentCents,
    percent: progressPercent(spentCents, budgetCents),
    remainingCents: budgetCents - spentCents,
    overspendCents: spentCents - budgetCents,
    level,
  };
}

export interface WarningItem {
  /** 预警对象 key：`total` 或 `cat:{categoryId}`（当日关闭状态的存储键） */
  key: string;
  level: BudgetLevel;
  /** 按 03 §5.4 文案模板生成 */
  message: string;
}

/**
 * 顶部提示条文案（03 §5.4）。
 * 排序：已超支优先于接近超支、总预算优先于分类预算 [Assumption, TBD]。
 */
export function buildWarnings(
  periodLabel: string,
  total: BudgetProgressView | null,
  categoryViews: Array<{ categoryId: string; name: string; view: BudgetProgressView }>,
): WarningItem[] {
  const items: WarningItem[] = [];
  const fmt = (cents: number) => `¥${(Math.abs(cents) / 100).toFixed(2)}`;
  if (total && total.level !== 'normal') {
    items.push({
      key: 'total',
      level: total.level,
      message:
        total.level === 'overspend'
          ? `${periodLabel}总预算已超支 ${fmt(total.overspendCents)}`
          : `${periodLabel}总预算已使用 ${total.percent}%，剩余 ${fmt(total.remainingCents)}`,
    });
  }
  for (const { categoryId, name, view } of categoryViews) {
    if (view.level === 'normal') continue;
    items.push({
      key: `cat:${categoryId}`,
      level: view.level,
      message:
        view.level === 'overspend'
          ? `「${name}」${periodLabel}预算已超支 ${fmt(view.overspendCents)}`
          : `「${name}」${periodLabel}预算已使用 ${view.percent}%，剩余 ${fmt(view.remainingCents)}`,
    });
  }
  return items.sort((a, b) => {
    const weight = (w: WarningItem) => (w.level === 'overspend' ? 0 : 1) + (w.key === 'total' ? 0 : 2);
    return weight(a) - weight(b);
  });
}

/** 从预算对象取分类预算金额映射 */
export function categoryBudgetMap(budget: Budget | undefined): Map<string, number> {
  return new Map((budget?.categoryBudgets ?? []).map((c) => [c.categoryId, c.amountCents]));
}

/** 当前自然月 key（YYYY-MM） */
export function currentMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
