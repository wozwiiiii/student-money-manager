import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AppMeta,
  AppSettings,
  AssetSnapshot,
  Budget,
  Category,
  CustomCycle,
  GoalEntry,
  MappingRule,
  RiskProfile,
  SavingsGoal,
  Transaction,
} from '@/lib/types';

/**
 * 本地数据库（IndexedDB，经 Dexie 封装）。
 * 存储内容对应 spec/08 §2.2 权威清单 S1～S9（S10 自选股为二期）。
 * 数据访问一律经本文件与 repositories.ts，业务代码不直接触碰存储 API（AGENT.md §10.2 架构预留）。
 */
export class CampusFinanceDB extends Dexie {
  /** S1 账户 */
  accounts!: Table<Account, string>;
  /** S2 资产快照 */
  snapshots!: Table<AssetSnapshot, string>;
  /** S3 收支记录 */
  transactions!: Table<Transaction, string>;
  /** S4 分类 */
  categories!: Table<Category, string>;
  /** S4 映射规则 */
  mappingRules!: Table<MappingRule, string>;
  /** S5 预算 */
  budgets!: Table<Budget, string>;
  /** S5 自定义周期 */
  customCycles!: Table<CustomCycle, string>;
  /** S6 储蓄目标 */
  goals!: Table<SavingsGoal, string>;
  /** S6 存入/取出记录 */
  goalEntries!: Table<GoalEntry, string>;
  /** S7 风险测评结果 */
  riskProfile!: Table<RiskProfile, string>;
  /** S8 设置项 */
  settings!: Table<AppSettings, string>;
  /** S9 应用状态记录 */
  appMeta!: Table<AppMeta, string>;

  constructor() {
    super('campus-finance-keeper');
    this.version(1).stores({
      accounts: 'id, assetType, name',
      snapshots: 'id, takenAt',
      transactions: 'id, date, direction, categoryId, accountId, source',
      categories: 'id, direction, parentId, builtin',
      mappingRules: 'id, keyword, builtin',
      budgets: 'id, cycleType, cycleKey',
      customCycles: 'id, startDate, endDate',
      goals: 'id, status, archived, deadline',
      goalEntries: 'id, goalId, date',
      riskProfile: 'id',
      settings: 'id',
      appMeta: 'id',
    });
  }
}

export const db = new CampusFinanceDB();
