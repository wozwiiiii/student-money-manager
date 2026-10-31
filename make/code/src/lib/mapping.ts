import type { Category, MappingRule } from './types';

/**
 * 分类自动映射（02 §4.4.5）：交易描述关键词包含匹配，命中即归类。
 * 作用顺序：用户自定义规则优先于内置默认规则；多条命中按规则列表顺序取第一条 [优先级细则 TBD]。
 */

/** 取一级分类 id（二级并入其一级，03 §3.3 预算与占比图均按一级聚合） */
export function level1CategoryId(category: Category | undefined): string | null {
  if (!category) return null;
  if (category.level === 1) return category.id;
  return category.parentId;
}

/** 按规则匹配分类；未匹配返回 null（预览页标「未分类」，02 §4.4.5） */
export function matchCategory(
  description: string,
  direction: 'income' | 'expense',
  rules: MappingRule[],
  categories: Category[],
): string | null {
  const ordered = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => Number(a.builtin) - Number(b.builtin));
  for (const rule of ordered) {
    if (rule.keyword !== '' && description.includes(rule.keyword)) {
      const target = categories.find((c) => c.id === rule.categoryId);
      if (target && target.direction === direction) {
        return level1CategoryId(target) ?? target.id;
      }
    }
  }
  return null;
}

/**
 * 「其他」兜底分类（02 §4.4.5：仍未分类的统一归入「其他」，03 §3.1/3.2 为「其他支出」「其他收入」）。
 * 未找到时返回 null（由调用方提示，不虚构分类）。
 */
export function fallbackCategoryId(
  direction: 'income' | 'expense',
  categories: Category[],
): string | null {
  const name = direction === 'expense' ? '其他支出' : '其他收入';
  const target = categories.find((c) => c.level === 1 && c.direction === direction && c.name === name);
  return target?.id ?? null;
}
