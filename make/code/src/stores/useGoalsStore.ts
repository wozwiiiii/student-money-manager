import { create } from 'zustand';
import { goalEntriesRepo, goalsRepo } from '@/db/repositories';
import type { GoalEntry, SavingsGoal } from '@/lib/types';
import { newId, nowIso, today } from '@/lib/ids';
import { derivedStatus, savedCentsOf } from '@/lib/goals';

/** 储蓄目标状态（01 §5.6）：已储蓄金额 = 存入合计 − 取出合计（04 §2.4 手动累计式） */
interface GoalsState {
  goals: SavingsGoal[];
  entries: GoalEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addGoal: (
    input: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'archived' | 'achievedAt' | 'abandonedAt'>,
  ) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>) => Promise<void>;
  /** 删除目标及其全部存入记录（04 §2.6：二次确认由 UI 负责明示范围） */
  removeGoal: (id: string) => Promise<void>;
  /** 归档 / 取消归档（04 §2.6：归档是独立管理标记，不改变状态） */
  setArchived: (id: string, archived: boolean) => Promise<void>;
  /** 用户确认放弃（04 §2.5：记录放弃日期） */
  abandonGoal: (id: string) => Promise<void>;
  /** 已放弃目标重新开启（04 §2.6） */
  reopenGoal: (id: string) => Promise<void>;
  addEntry: (input: Omit<GoalEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateEntry: (id: string, patch: Partial<Omit<GoalEntry, 'id' | 'createdAt'>>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
}

/**
 * 存入记录变化后刷新目标状态（04 §2.5）：
 * 已储蓄 ≥ 目标金额自动转「已达成」并记录达成日期（触发达成的记录日期）；
 * 目标金额上调后重开回「进行中」并清除达成日期。已放弃状态不自动迁移。
 */
async function refreshGoalStatus(goalId: string, triggerDate: string): Promise<void> {
  const goal = await goalsRepo.get(goalId);
  if (!goal) return;
  const entries = await goalEntriesRepo.byGoal(goalId);
  const saved = savedCentsOf(goalId, entries);
  const next = derivedStatus(goal, saved);
  if (next === goal.status) return;
  await goalsRepo.save({
    ...goal,
    status: next,
    achievedAt: next === 'achieved' ? triggerDate : null,
    updatedAt: nowIso(),
  });
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  entries: [],
  loaded: false,
  load: async () => {
    const [goals, entries] = await Promise.all([goalsRepo.all(), goalEntriesRepo.all()]);
    set({ goals, entries, loaded: true });
  },
  addGoal: async (input) => {
    const now = nowIso();
    await goalsRepo.save({
      ...input,
      id: newId(),
      status: 'active',
      archived: false,
      achievedAt: null,
      abandonedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await get().load();
  },
  updateGoal: async (id, patch) => {
    const existing = await goalsRepo.get(id);
    if (!existing) return;
    await goalsRepo.save({ ...existing, ...patch, updatedAt: nowIso() });
    // 目标金额调整可触发达成/重开（04 §2.5/2.6）
    await refreshGoalStatus(id, today());
    await get().load();
  },
  removeGoal: async (id) => {
    for (const e of (await goalEntriesRepo.byGoal(id))) await goalEntriesRepo.remove(e.id);
    await goalsRepo.remove(id);
    await get().load();
  },
  setArchived: async (id, archived) => {
    await get().updateGoal(id, { archived });
  },
  abandonGoal: async (id) => {
    await get().updateGoal(id, { status: 'abandoned', abandonedAt: today() });
  },
  reopenGoal: async (id) => {
    await get().updateGoal(id, { status: 'active', abandonedAt: null });
  },
  addEntry: async (input) => {
    await goalEntriesRepo.save({ ...input, id: newId(), createdAt: nowIso() });
    await refreshGoalStatus(input.goalId, input.date);
    await get().load();
  },
  updateEntry: async (id, patch) => {
    const existing = await goalEntriesRepo.get(id);
    if (!existing) return;
    await goalEntriesRepo.save({ ...existing, ...patch, createdAt: existing.createdAt });
    await refreshGoalStatus(existing.goalId, patch.date ?? existing.date);
    await get().load();
  },
  removeEntry: async (id) => {
    const existing = await goalEntriesRepo.get(id);
    await goalEntriesRepo.remove(id);
    if (existing) await refreshGoalStatus(existing.goalId, today());
    await get().load();
  },
}));
