import { create } from 'zustand';
import { categoriesRepo, mappingRulesRepo } from '@/db/repositories';
import type { Category, MappingRule } from '@/lib/types';

/** 分类与映射规则状态（01 §5.4；自定义规则优先于内置规则，02 §4.4.5） */
interface CategoriesState {
  categories: Category[];
  mappingRules: MappingRule[];
  loaded: boolean;
  load: () => Promise<void>;
  addCategory: (input: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => Promise<void>;
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
    await categoriesRepo.save({ ...input, id: crypto.randomUUID() });
    await get().load();
  },
  updateCategory: async (id, patch) => {
    const existing = await categoriesRepo.get(id);
    if (!existing) return;
    await categoriesRepo.save({ ...existing, ...patch });
    await get().load();
  },
  addMappingRule: async (input) => {
    await mappingRulesRepo.save({ ...input, id: crypto.randomUUID() });
    await get().load();
  },
  removeMappingRule: async (id) => {
    await mappingRulesRepo.remove(id);
    await get().load();
  },
}));
