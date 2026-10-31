import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { initDatabase } from './seed';
import { categoriesRepo, mappingRulesRepo, settingsRepo, appMetaRepo } from './repositories';
import { DEFAULT_SETTINGS } from '@/lib/defaults';

describe('initDatabase（默认数据种子）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('写入内置分类清单（03 §3.1/3.2）', async () => {
    await initDatabase();
    const expense = await categoriesRepo.byDirection('expense');
    const income = await categoriesRepo.byDirection('income');

    // 支出 10 个一级分类
    const expenseL1 = expense.filter((c) => c.level === 1);
    expect(expenseL1.map((c) => c.name)).toEqual([
      '餐饮', '学习', '购物', '交通', '通讯', '娱乐', '医疗', '住宿', '人情往来', '其他支出',
    ]);
    // 收入 7 个一级分类
    const incomeL1 = income.filter((c) => c.level === 1);
    expect(incomeL1.map((c) => c.name)).toEqual([
      '生活费', '兼职', '奖学金', '助学金与补助', '红包', '二手转卖', '其他收入',
    ]);
    // 二级分类挂到唯一一级分类
    for (const child of expense.filter((c) => c.level === 2)) {
      expect(expenseL1.some((p) => p.id === child.parentId)).toBe(true);
    }
    // 兜底分类无二级
    const other = expenseL1.find((c) => c.name === '其他支出')!;
    expect(expense.some((c) => c.parentId === other.id)).toBe(false);
  });

  it('写入内置映射规则并指向分类（02 §4.4.5 示例表）', async () => {
    await initDatabase();
    const rules = await mappingRulesRepo.all();
    expect(rules.length).toBeGreaterThan(0);
    const categoryIds = new Set((await categoriesRepo.all()).map((c) => c.id));
    for (const rule of rules) {
      expect(categoryIds.has(rule.categoryId)).toBe(true);
      expect(rule.builtin).toBe(true);
    }
    // 示例：关键词"食堂"归入餐饮
    const canteen = rules.find((r) => r.keyword === '食堂')!;
    const category = await categoriesRepo.get(canteen.categoryId);
    expect(category?.name).toBe('餐饮');
    expect(category?.direction).toBe('expense');
  });

  it('写入默认设置与应用状态（05 §5.1、08 §3.3）', async () => {
    await initDatabase();
    expect(await settingsRepo.get()).toEqual(DEFAULT_SETTINGS);
    const meta = await appMetaRepo.get();
    expect(meta.firstUseNoticeAckAt).toBeNull();
    expect(meta.lastBackupExportAt).toBeNull();
  });

  it('幂等：重复初始化不产生重复数据', async () => {
    await initDatabase();
    const categoriesBefore = await categoriesRepo.all();
    const rulesBefore = await mappingRulesRepo.all();
    await initDatabase();
    const categoriesAfter = await categoriesRepo.all();
    const rulesAfter = await mappingRulesRepo.all();
    expect(categoriesAfter.length).toBe(categoriesBefore.length);
    expect(rulesAfter.length).toBe(rulesBefore.length);
  });
});
