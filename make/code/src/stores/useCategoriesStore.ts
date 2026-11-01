import { create } from 'zustand';
import { budgetsRepo, categoriesRepo, mappingRulesRepo, transactionsRepo } from '@/db/repositories';
import type { Category, MappingRule } from '@/lib/types';
import { newId } from '@/lib/ids';

/**
 * 分类与映射规则状态（01 §5.4；自定义规则优先于内置规则，02 §4.4.5）。
 * 分类自定义规则（删除保护、迁移、停用）见 spec/05 第 3 章。
 */

/** 删除分类时移除其在各预算周期上的分类预算设置（05 §3.3）：周期本身、总预算与其他分类预算不受影响 */
async function dropCategoryBudgets(categoryId: string): Promise<void> {
  for (const b of await budgetsRepo.all()) {
    const kept = b.categoryBudgets.filter((c) => c.categoryId !== categoryId);
    if (kept.length !== b.categoryBudgets.length) {
      await budgetsRepo.save({ ...b, categoryBudgets: kept });
    }
  }
}

interface CategoriesState {
  categories: Category[];
  mappingRules: MappingRule[];
  loaded: boolean;
  load: () => Promise<void>;
  addCategory: (input: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => Promise<void>;
  /** 停用 / 启用（05 §3.4）：仅影响选择列表可见性，历史记录归类与统计不受影响 */
  setDisabled: (id: string, disabled: boolean) => Promise<void>;
  /**
   * 删除分类（05 §3.3）：仅限分类下无收支记录的自定义分类；
   * 删除时其分类预算设置一并移除。分类下有记录时须先迁移（removeCategoryWithMigration）。
   */
  removeCategory: (id: string) => Promise<void>;
  /**
   * 迁移后删除（05 §3.3）：把源分类下全部收支记录改归目标分类，再删除源分类。
   * 仅改变记录的分类归属，不触碰记录的其他要素。
   */
  removeCategoryWithMigration: (id: string, targetCategoryId: string) => Promise<void>;
  addMappingRule: (input: Omit<MappingRule, 'id'>) => Promise<void>;
  removeMappingRule: (id: string) => Promise<void>;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  mappingRules: [],
  loaded: false,
  load: async () => {
    const [categories, mappingRules] = await Promise.all([
      categoriesRepo.all(),
      mappingRulesRepo.all(),
    ]);
    set({ categories, mappingRules, loaded: true });
  },
  addCategory: async (input) => {
    await categoriesRepo.save({ ...input, id: newId() });
    await get().load();
  },
  updateCategory: async (id, patch) => {
    const existing = await categoriesRepo.get(id);
    if (!existing) return;
    await categoriesRepo.save({ ...existing, ...patch });
    await get().load();
  },
  setDisabled: async (id, disabled) => {
    await get().updateCategory(id, { disabled });
  },
  removeCategory: async (id) => {
    await categoriesRepo.remove(id);
    await dropCategoryBudgets(id);
    await get().load();
  },
  removeCategoryWithMigration: async (id, targetCategoryId) => {
    for (const t of await transactionsRepo.all()) {
      if (t.categoryId === id) await transactionsRepo.save({ ...t, categoryId: targetCategoryId });
    }
    await get().removeCategory(id);
  },
  addMappingRule: async (input) => {
    await mappingRulesRepo.save({ ...input, id: newId() });
    await get().load();
  },
  removeMappingRule: async (id) => {
    await mappingRulesRepo.remove(id);
    await get().load();
  },
}));
