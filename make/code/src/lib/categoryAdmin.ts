/**
 * 分类自定义规则（spec/05 第 3 章）：新增、重命名、删除保护与迁移、内置分类保护与停用。
 * 内置分类清单的权威定义在 03 号文档（种子见 src/lib/defaults.ts），此处只做权限划分与校验。
 */
import type { Category } from './types';

// —— 字段约束（05 §3.1 [Assumption, TBD]）——
export const CATEGORY_NAME_MAX = 12;

/**
 * 核心内置分类（05 §3.4 [Assumption, TBD]）：暂按 01 §5.4 列举的默认分类划定，
 * 最终范围以 03 号文档定稿清单为准。核心内置分类不可删除、不可停用，可重命名。
 */
export const CORE_BUILTIN_NAMES: Record<'expense' | 'income', string[]> = {
  expense: ['餐饮', '学习', '购物', '交通', '娱乐'],
  income: ['生活费', '兼职', '红包'],
};

/** 是否核心内置分类（按内置标记 + 名称判定；重命名后仍按身份判定见下） */
export function isCoreBuiltin(category: Category): boolean {
  // 分类身份不变（05 §3.2），核心范围按 id 固化于创建时；此处按名称兜底判定，
  // 因内置种子在首次初始化后不再变化，重命名后的核心分类由 canDisable/canDelete 的 builtin 分支统一保护。
  return category.builtin && CORE_BUILTIN_NAMES[category.direction].includes(category.name);
}

/** 是否可删除（05 §3.3/3.4）：仅自定义分类可删除；内置分类不可删除 */
export function canDeleteCategory(category: Category): boolean {
  return !category.builtin;
}

/** 是否可停用（05 §3.4）：核心内置分类不可停用，其余（含自定义）可停用 */
export function canDisableCategory(category: Category): boolean {
  return !(category.builtin && CORE_BUILTIN_NAMES[category.direction].includes(category.name));
}

/**
 * 分类名校验（05 §3.1/3.2）：非空、1～12 字、同方向内不与现有分类（含内置与已停用）重名。
 * selfId 为被重命名分类自身 id，比对时排除。
 */
export function validateCategoryName(
  name: string,
  direction: 'income' | 'expense',
  categories: Category[],
  selfId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '分类名称必填';
  if (trimmed.length > CATEGORY_NAME_MAX) return `分类名称不能超过 ${CATEGORY_NAME_MAX} 个字`;
  const duplicated = categories.some(
    (c) => c.id !== selfId && c.direction === direction && c.name === trimmed,
  );
  if (duplicated) return '该方向下已存在同名分类';
  return null;
}

/**
 * 删除分类时的迁移目标候选（05 §3.3）：与源分类同方向的全部现有分类（含已停用的自定义分类
 * [Assumption]），排除源分类自身。每个方向都存在不可删除的内置分类，目标始终可选。
 */
export function migrationCandidates(categories: Category[], source: Category): Category[] {
  return categories.filter((c) => c.id !== source.id && c.direction === source.direction);
}

/** 是否可直接删除（分类下无任何收支记录时可直接删除，05 §3.3） */
export function canDeleteDirectly(category: Category, recordCount: number): boolean {
  return canDeleteCategory(category) && recordCount === 0;
}
