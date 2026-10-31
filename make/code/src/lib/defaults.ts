import type { AppMeta, AppSettings, Category, MappingRule } from './types';

/**
 * 内置默认数据。
 * 分类清单来源：spec/03 §3.1（支出）、§3.2（收入）；映射规则示例来源：spec/02 §4.4.5（完整默认规则表 [TBD]，此处仅落已给出的示例规则）；
 * 设置默认值来源：spec/05 §5.1、spec/08 §3.3。
 */

interface CategorySeed {
  name: string;
  children?: string[];
}

const EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: '餐饮', children: ['食堂', '外卖', '饮品奶茶', '水果零食', '聚餐'] },
  { name: '学习', children: ['教材书籍', '文具', '打印复印', '课程与网课', '考试报名'] },
  { name: '购物', children: ['日用品', '服饰鞋包', '美妆护肤', '数码产品'] },
  { name: '交通', children: ['公交地铁', '共享单车', '打车', '火车机票'] },
  { name: '通讯', children: ['话费流量', '宽带网费'] },
  { name: '娱乐', children: ['电影演出', '游戏充值', '会员订阅', '旅游出行', '运动健身'] },
  { name: '医疗', children: ['药品', '门诊', '体检'] },
  { name: '住宿', children: ['房租', '水电燃气', '宿舍用品'] },
  { name: '人情往来', children: ['礼物', '随礼', '请客'] },
  { name: '其他支出' },
];

const INCOME_CATEGORIES: CategorySeed[] = [
  { name: '生活费', children: ['每月生活费', '学期生活费', '家庭转账'] },
  { name: '兼职', children: ['校内勤工俭学', '校外兼职', '家教'] },
  { name: '奖学金', children: ['国家奖学金', '学校奖学金', '其他奖学金'] },
  { name: '助学金与补助', children: ['助学金', '困难补助', '其他补贴'] },
  { name: '红包', children: ['节日红包', '生日红包', '其他红包'] },
  { name: '二手转卖', children: ['闲置出售', '旧书出售'] },
  { name: '其他收入', children: ['退款返还', '其他'] },
];

/** 内置映射规则（02 §4.4.5 示例表）：关键词 → 一级分类名。完整默认规则表 [TBD]，未给出的不虚构。 */
const BUILTIN_MAPPING_RULES: Array<{ keywords: string[]; direction: 'expense' | 'income'; categoryName: string }> = [
  { keywords: ['食堂', '外卖', '奶茶', '餐厅'], direction: 'expense', categoryName: '餐饮' },
  { keywords: ['地铁', '公交', '单车', '打车'], direction: 'expense', categoryName: '交通' },
  { keywords: ['淘宝', '京东', '拼多多', '快递'], direction: 'expense', categoryName: '购物' },
  { keywords: ['书店', '文具', '打印', '网课'], direction: 'expense', categoryName: '学习' },
  { keywords: ['电影', '游戏', '视频会员'], direction: 'expense', categoryName: '娱乐' },
  { keywords: ['话费', '流量'], direction: 'expense', categoryName: '通讯' },
  { keywords: ['红包', '转账'], direction: 'income', categoryName: '红包' },
  { keywords: ['兼职', '劳务', '工资'], direction: 'income', categoryName: '兼职' },
  { keywords: ['生活费'], direction: 'income', categoryName: '生活费' },
];

/** 设置默认值（05 §5.1 [Assumption, TBD]、08 §3.3 [Assumption, TBD]） */
export const DEFAULT_SETTINGS: AppSettings = {
  id: 'current',
  alertThresholdPct: 80,
  gradedReminderEnabled: true,
  backupReminderEnabled: true,
  backupReminderDays: 30,
};

export const DEFAULT_APP_META: AppMeta = {
  id: 'current',
  firstUseNoticeAckAt: null,
  educationDisclaimerAckAt: null,
  stockDisclaimerAckAt: null,
  bankDisclaimerAckAt: null,
  lastBackupExportAt: null,
};

/** 生成内置分类列表（id 由调用方注入，保证种子幂等可测） */
export function buildBuiltinCategories(
  makeId: () => string,
  now: string,
): Category[] {
  void now;
  const categories: Category[] = [];
  let sortOrder = 0;
  const appendTree = (seeds: CategorySeed[], direction: 'expense' | 'income') => {
    for (const seed of seeds) {
      const parentId = makeId();
      categories.push({
        id: parentId,
        name: seed.name,
        direction,
        parentId: null,
        level: 1,
        builtin: true,
        disabled: false,
        sortOrder: sortOrder++,
      });
      for (const childName of seed.children ?? []) {
        categories.push({
          id: makeId(),
          name: childName,
          direction,
          parentId,
          level: 2,
          builtin: true,
          disabled: false,
          sortOrder: sortOrder++,
        });
      }
    }
  };
  appendTree(EXPENSE_CATEGORIES, 'expense');
  appendTree(INCOME_CATEGORIES, 'income');
  return categories;
}

/** 由分类列表构建内置映射规则（按名称解析分类 id） */
export function buildBuiltinMappingRules(
  categories: Category[],
  makeId: () => string,
): MappingRule[] {
  const byName = new Map<string, string>();
  for (const c of categories) {
    if (c.level === 1) byName.set(`${c.direction}:${c.name}`, c.id);
  }
  const rules: MappingRule[] = [];
  for (const rule of BUILTIN_MAPPING_RULES) {
    const categoryId = byName.get(`${rule.direction}:${rule.categoryName}`);
    if (!categoryId) continue;
    for (const keyword of rule.keywords) {
      rules.push({ id: makeId(), keyword, categoryId, builtin: true, enabled: true });
    }
  }
  return rules;
}
