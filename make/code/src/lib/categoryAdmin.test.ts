import { describe, expect, it } from 'vitest';
import {
  canDeleteCategory,
  canDeleteDirectly,
  canDisableCategory,
  migrationCandidates,
  validateCategoryName,
} from './categoryAdmin';
import type { Category } from './types';

const cat = (patch: Partial<Category>): Category => ({
  id: 'c1',
  name: '餐饮',
  direction: 'expense',
  parentId: null,
  level: 1,
  builtin: true,
  disabled: false,
  sortOrder: 0,
  ...patch,
});

describe('内置分类保护（05 §3.4）', () => {
  it('内置分类不可删除；核心内置分类不可停用；其余内置与自定义可停用', () => {
    const coreBuiltin = cat({ name: '餐饮' });
    const otherBuiltin = cat({ id: 'c2', name: '医疗' });
    const custom = cat({ id: 'c3', name: '社团活动', builtin: false });

    expect(canDeleteCategory(coreBuiltin)).toBe(false);
    expect(canDeleteCategory(otherBuiltin)).toBe(false);
    expect(canDeleteCategory(custom)).toBe(true);

    expect(canDisableCategory(coreBuiltin)).toBe(false);
    expect(canDisableCategory(otherBuiltin)).toBe(true);
    expect(canDisableCategory(custom)).toBe(true);
  });

  it('核心内置范围分方向：收入侧为生活费/兼职/红包', () => {
    expect(canDisableCategory(cat({ name: '生活费', direction: 'income' }))).toBe(false);
    expect(canDisableCategory(cat({ name: '奖学金', direction: 'income' }))).toBe(true);
    // 核心范围按名称判定，重命名后的内置分类仍按内置保护（不可删除）
    expect(canDeleteCategory(cat({ name: '吃饭' }))).toBe(false);
    expect(canDisableCategory(cat({ name: '吃饭' }))).toBe(true);
  });
});

describe('分类名校验（05 §3.1/3.2）', () => {
  const categories = [
    cat({ id: 'c1', name: '餐饮' }),
    cat({ id: 'c2', name: '吃饭', builtin: false, disabled: true }),
    cat({ id: 'c3', name: '餐饮', direction: 'income' }),
  ];

  it('必填、1～12 字', () => {
    expect(validateCategoryName('', 'expense', categories)).toBe('分类名称必填');
    expect(validateCategoryName('   ', 'expense', categories)).toBe('分类名称必填');
    expect(validateCategoryName('字'.repeat(13), 'expense', categories)).toContain('不能超过');
    expect(validateCategoryName('社团活动', 'expense', categories)).toBeNull();
  });

  it('同方向内不得重名（含内置与已停用分类），重命名自身除外', () => {
    expect(validateCategoryName('餐饮', 'expense', categories)).toBe('该方向下已存在同名分类');
    expect(validateCategoryName('吃饭', 'expense', categories)).toBe('该方向下已存在同名分类');
    // 收入侧的「餐饮」与支出侧同名分类不冲突，但与收入侧已有分类冲突
    expect(validateCategoryName('餐饮', 'income', categories)).toBe('该方向下已存在同名分类');
    // 仅存在于支出侧的名称，收入侧可用（两套独立体系，01 §5.4）
    expect(validateCategoryName('吃饭', 'income', categories)).toBeNull();
    // 重命名自身：允许保留原名
    expect(validateCategoryName('餐饮', 'expense', categories, 'c1')).toBeNull();
  });
});

describe('删除保护与迁移（05 §3.3）', () => {
  it('分类下有收支记录时不可直接删除，须迁移或停用', () => {
    const custom = cat({ id: 'c3', name: '社团活动', builtin: false });
    expect(canDeleteDirectly(custom, 0)).toBe(true);
    expect(canDeleteDirectly(custom, 3)).toBe(false);
    expect(canDeleteDirectly(cat({}), 0)).toBe(false); // 内置分类无论如何不可直接删除
  });

  it('迁移目标候选 = 同方向全部现有分类（含已停用），排除自身', () => {
    const source = cat({ id: 'c3', name: '社团活动', builtin: false });
    const categories = [
      source,
      cat({ id: 'c1', name: '餐饮' }),
      cat({ id: 'c2', name: '吃饭', builtin: false, disabled: true }),
      cat({ id: 'c4', name: '生活费', direction: 'income' }),
    ];
    expect(migrationCandidates(categories, source).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});
