/**
 * 储蓄目标纯逻辑（spec/04 第 2 章）。
 * 已储蓄金额采用手动累计式：= 存入总额 − 取出总额（04 §2.4），与资产快照互不推导（01 §5.2/5.6）。
 */
import type { GoalEntry, GoalStatus, SavingsGoal } from './types';

// —— 字段约束（04 §2.3/2.4 [Assumption, TBD]，上线前可评审调整）——
export const GOAL_NAME_MAX = 20;
export const GOAL_NOTE_MAX = 200;
export const ENTRY_MEMO_MAX = 50;

/** 已储蓄金额（分）= 存入合计 − 取出合计（04 §2.4） */
export function savedCentsOf(goalId: string, entries: GoalEntry[]): number {
  let sum = 0;
  for (const e of entries) {
    if (e.goalId !== goalId) continue;
    sum += e.type === 'deposit' ? e.amountCents : -e.amountCents;
  }
  return sum;
}

/**
 * 进度百分比（04 §2.4）：向下取整；仅当判定达成（已储蓄 ≥ 目标金额）时展示 100%。
 * 已储蓄超过目标时进度条封顶 100%，超出金额另行提示。
 */
export function goalProgressPct(savedCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  if (savedCents >= targetCents) return 100;
  return Math.floor((savedCents / targetCents) * 100);
}

/** 达成判定（04 §2.5）：已储蓄金额 ≥ 目标金额 */
export function isGoalReached(savedCents: number, targetCents: number): boolean {
  return targetCents > 0 && savedCents >= targetCents;
}

/** YYYY-MM-DD 日期差：b − a（自然日） */
export function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ms = Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2]);
  return Math.round(ms / 86400000);
}

/** 日期加 N 天，返回 YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  const p = date.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 剩余天数（04 §2.4）：目标日期 − 今天（自然日）。
 * > 0 剩余 N 天；= 0 今日截止；< 0 已到期 N 天（取绝对值展示）。
 */
export function remainingDays(deadline: string, todayDate: string): number {
  return diffDays(todayDate, deadline);
}

/** 逾期：目标日期已过但仍未达成（04 §2.5：状态保持进行中，仅置顶高亮） */
export function isOverdue(goal: SavingsGoal, savedCents: number, todayDate: string): boolean {
  return goal.status === 'active' && !isGoalReached(savedCents, goal.targetCents) && remainingDays(goal.deadline, todayDate) < 0;
}

/**
 * 完成预期提示（04 §2.4）。
 * 展示前提 [Assumption, TBD：前提参数与公式为推断性设定，上线前经试用数据校准]：
 * 存入记录 ≥ 2 条，且自首条记录日期至今天 ≥ 7 天，且每周平均存入 > 0，且目标未达成。
 */
export type PaceForecast =
  | { kind: 'achieved' }
  | { kind: 'insufficient' }
  | { kind: 'onTrack'; weeklyAvgCents: number; etaDate: string }
  | { kind: 'late'; weeklyAvgCents: number; etaDate: string; lateDays: number; requiredWeeklyCents: number };

export function paceForecast(
  goal: SavingsGoal,
  entries: GoalEntry[],
  todayDate: string,
): PaceForecast {
  const own = entries
    .filter((e) => e.goalId === goal.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const saved = savedCentsOf(goal.id, entries);
  if (isGoalReached(saved, goal.targetCents)) return { kind: 'achieved' };
  if (own.length < 2) return { kind: 'insufficient' };

  const daysSinceFirst = diffDays(own[0].date, todayDate);
  if (daysSinceFirst < 7) return { kind: 'insufficient' };

  // 经过周数 = 自首条记录日期至今天的天数 ÷ 7，向上取整且至少为 1
  const weeksElapsed = Math.max(1, Math.ceil(daysSinceFirst / 7));
  const weeklyAvgCents = saved / weeksElapsed;
  if (weeklyAvgCents <= 0) return { kind: 'insufficient' };

  const remainingCents = goal.targetCents - saved;
  // 预计达成日期 = 今天 + ⌈剩余金额 ÷ 每周平均存入 × 7⌉ 天
  const etaDays = Math.ceil((remainingCents / weeklyAvgCents) * 7);
  const etaDate = addDays(todayDate, etaDays);
  const lateDays = diffDays(goal.deadline, etaDate);
  if (lateDays <= 0) return { kind: 'onTrack', weeklyAvgCents, etaDate };

  // 晚于目标日期：剩余周数 =（目标日期 − 今天）÷ 7，向上取整且至少为 1
  const remainingWeeks = Math.max(1, Math.ceil(diffDays(todayDate, goal.deadline) / 7));
  return {
    kind: 'late',
    weeklyAvgCents,
    etaDate,
    lateDays,
    requiredWeeklyCents: remainingCents / remainingWeeks,
  };
}

/**
 * 主列表排序（04 §2.2）：逾期的进行中置顶，其余进行中按目标日期从近到远，已达成与已放弃沉底。
 * 归档目标不进主列表（由调用方过滤）。
 */
export function compareGoals(a: SavingsGoal, b: SavingsGoal, todayDate: string, entries: GoalEntry[]): number {
  const group = (g: SavingsGoal): number => {
    if (g.status !== 'active') return 2;
    return isOverdue(g, savedCentsOf(g.id, entries), todayDate) ? 0 : 1;
  };
  const ga = group(a);
  const gb = group(b);
  if (ga !== gb) return ga - gb;
  if (ga === 2) return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
  return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
}

/**
 * 状态推导（04 §2.5）：仅处理自动迁移（进行中 ↔ 已达成）；
 * 已放弃只能经用户"重新开启"操作，不自动迁移。归档是独立标记，不参与状态机。
 */
export function derivedStatus(goal: SavingsGoal, savedCents: number): GoalStatus {
  if (goal.status === 'abandoned') return 'abandoned';
  return isGoalReached(savedCents, goal.targetCents) ? 'achieved' : 'active';
}

// —— 校验（04 §2.7），返回中文错误文案，null 表示通过 ——

export function validateGoalName(name: string): string | null {
  const len = name.trim().length;
  if (len < 1 || len > GOAL_NAME_MAX) return `请输入 1～${GOAL_NAME_MAX} 字的目标名称`;
  return null;
}

export function validateTargetCents(cents: number | null): string | null {
  if (cents === null || cents <= 0) return '目标金额必须大于 0';
  return null;
}

/**
 * 目标日期校验（04 §2.7）：创建时不得早于今天；
 * 编辑逾期目标允许保留原过去日期（否则无法修改其他字段），仅当改为早于今天的新值时阻止。
 */
export function validateGoalDate(
  date: string,
  todayDate: string,
  originalDate?: string,
): string | null {
  if (!date) return '目标日期不能为空';
  if (date >= todayDate) return null;
  if (originalDate !== undefined && date === originalDate) return null;
  return '目标日期不能早于今天';
}

export function validateEntryAmount(cents: number | null): string | null {
  if (cents === null || cents <= 0) return '金额必须大于 0';
  return null;
}

/**
 * 取出校验（04 §2.7 [Assumption]）：取出后累计已储蓄不得为负。
 * target 参数用于计算"不含本次修改"的当前已储蓄（编辑记录时传入扣除原记录后的值）。
 */
export function validateWithdraw(currentSavedCents: number, withdrawCents: number): string | null {
  if (currentSavedCents - withdrawCents < 0) return '取出金额不能超过当前已储蓄金额';
  return null;
}
