import { create } from 'zustand';
import { budgetsRepo, customCyclesRepo } from '@/db/repositories';
import type { Budget, CustomCycle } from '@/lib/types';
import { newId, nowIso } from '@/lib/ids';

/** 预算与周期状态（01 §5.5：月度自动滚动、自定义手动创建，记录不隶属周期） */
interface BudgetsState {
  budgets: Budget[];
  customCycles: CustomCycle[];
  loaded: boolean;
  load: () => Promise<void>;
  saveBudget: (budget: Omit<Budget, 'id' | 'updatedAt'> & { id?: string }) => Promise<void>;
  addCustomCycle: (input: Omit<CustomCycle, 'id' | 'createdAt' | 'ended'>) => Promise<void>;
  updateCustomCycle: (id: string, patch: Partial<Omit<CustomCycle, 'id' | 'createdAt'>>) => Promise<void>;
  /** 删除周期及其预算设置，不改动任何收支记录（03 §4.2 规则 6） */
  removeCustomCycle: (id: string) => Promise<void>;
  endCustomCycle: (id: string) => Promise<void>;
}

export const useBudgetsStore = create<BudgetsState>((set, get) => ({
  budgets: [],
  customCycles: [],
  loaded: false,
  load: async () => {
    const [budgets, customCycles] = await Promise.all([budgetsRepo.all(), customCyclesRepo.all()]);
    set({ budgets, customCycles, loaded: true });
  },
  saveBudget: async (input) => {
    const id = input.id ?? newId();
    await budgetsRepo.save({ ...input, id, updatedAt: nowIso() });
    await get().load();
  },
  addCustomCycle: async (input) => {
    await customCyclesRepo.save({ ...input, id: newId(), ended: false, createdAt: nowIso() });
    await get().load();
  },
  updateCustomCycle: async (id, patch) => {
    const existing = await customCyclesRepo.get(id);
    if (!existing) return;
    await customCyclesRepo.save({ ...existing, ...patch });
    await get().load();
  },
  removeCustomCycle: async (id) => {
    await customCyclesRepo.remove(id);
    // 该周期上的预算设置一并删除（03 §4.2 规则 6）
    const linked = (await budgetsRepo.all()).filter((b) => b.cycleType === 'custom' && b.cycleKey === id);
    for (const b of linked) await budgetsRepo.remove(b.id);
    await get().load();
  },
  endCustomCycle: async (id) => {
    const existing = await customCyclesRepo.get(id);
    if (!existing) return;
    await customCyclesRepo.save({ ...existing, ended: true });
    await get().load();
  },
}));
