import { create } from 'zustand';
import { goalEntriesRepo, goalsRepo } from '@/db/repositories';
import type { GoalEntry, GoalStatus, SavingsGoal } from '@/lib/types';
import { newId, nowIso } from '@/lib/ids';
import { sumCents } from '@/lib/money';

/** 储蓄目标状态（01 §5.6）：已储蓄金额 = 存入合计 − 取出合计 */
interface GoalsState {
  goals: SavingsGoal[];
  entries: GoalEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addGoal: (input: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'archived'>) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>) => Promise<void>;
  setGoalStatus: (id: string, status: GoalStatus) => Promise<void>;
  addEntry: (input: Omit<GoalEntry, 'id' | 'createdAt'>) => Promise<void>;
  /** 目标的已储蓄金额（分） */
  savedCentsOf: (goalId: string) => number;
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
      createdAt: now,
      updatedAt: now,
    });
    await get().load();
  },
  updateGoal: async (id, patch) => {
    const existing = await goalsRepo.get(id);
    if (!existing) return;
    await goalsRepo.save({ ...existing, ...patch, updatedAt: nowIso() });
    await get().load();
  },
  setGoalStatus: async (id, status) => {
    await get().updateGoal(id, { status });
  },
  addEntry: async (input) => {
    await goalEntriesRepo.save({ ...input, id: newId(), createdAt: nowIso() });
    await get().load();
  },
  savedCentsOf: (goalId) => {
    const { entries } = get();
    const deposits = sumCents(entries.filter((e) => e.goalId === goalId && e.type === 'deposit').map((e) => e.amountCents));
    const withdrawals = sumCents(entries.filter((e) => e.goalId === goalId && e.type === 'withdraw').map((e) => e.amountCents));
    return deposits - withdrawals;
  },
}));
