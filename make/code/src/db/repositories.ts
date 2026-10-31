import { db } from './database';
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
 * 数据访问层（repositories）：业务代码经此访问本地数据，不直接触碰 Dexie API（AGENT.md §10.2 架构预留）。
 * 后续扩展"本地 + 远端"双通道时在此层接入。
 */

type Entity = { id: string };

function repo<T extends Entity>(table: () => { toArray(): Promise<T[]>; get(id: string): Promise<T | undefined>; put(value: T): Promise<string>; delete(id: string): Promise<void> }) {
  return {
    all: (): Promise<T[]> => table().toArray(),
    get: (id: string): Promise<T | undefined> => table().get(id),
    save: (value: T): Promise<string> => table().put(value),
    remove: (id: string): Promise<void> => table().delete(id),
  };
}

export const accountsRepo = {
  ...repo<Account>(() => db.accounts),
  async add(input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Account> {
    const now = new Date().toISOString();
    const account: Account = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await db.accounts.add(account);
    return account;
  },
};

export const snapshotsRepo = {
  ...repo<AssetSnapshot>(() => db.snapshots),
  /** 按快照时间升序返回（资产趋势图需要时序） */
  allOrdered: (): Promise<AssetSnapshot[]> => db.snapshots.orderBy('takenAt').toArray(),
};

export const transactionsRepo = {
  ...repo<Transaction>(() => db.transactions),
  /** 按日期范围取记录 [startDate, endDate]（YYYY-MM-DD），用于周期统计 */
  byDateRange: (startDate: string, endDate: string): Promise<Transaction[]> =>
    db.transactions.where('date').between(startDate, endDate, true, true).toArray(),
  /** 重复判定比对范围（02 §4.4.6）：已保存的全部收支记录 */
  findByDateAmountMemo: (date: string, amountCents: number, memo: string): Promise<Transaction[]> =>
    db.transactions
      .where('date')
      .equals(date)
      .filter((t) => t.amountCents === amountCents && (t.originalMemo ?? t.memo ?? '') === memo)
      .toArray(),
};

export const categoriesRepo = {
  ...repo<Category>(() => db.categories),
  /** 按展示顺序（sortOrder）返回 */
  byDirection: async (direction: 'income' | 'expense'): Promise<Category[]> =>
    (await db.categories.where('direction').equals(direction).toArray()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
};

export const mappingRulesRepo = {
  ...repo<MappingRule>(() => db.mappingRules),
  enabled: (): Promise<MappingRule[]> => db.mappingRules.filter((r) => r.enabled).toArray(),
};

export const budgetsRepo = {
  ...repo<Budget>(() => db.budgets),
  byCycle: (cycleType: 'month' | 'custom', cycleKey: string): Promise<Budget | undefined> =>
    db.budgets.where('cycleKey').equals(cycleKey).filter((b) => b.cycleType === cycleType).first(),
};

export const customCyclesRepo = repo<CustomCycle>(() => db.customCycles);

export const goalsRepo = repo<SavingsGoal>(() => db.goals);

export const goalEntriesRepo = {
  ...repo<GoalEntry>(() => db.goalEntries),
  byGoal: (goalId: string): Promise<GoalEntry[]> =>
    db.goalEntries.where('goalId').equals(goalId).toArray(),
};

export const riskProfileRepo = {
  get: (): Promise<RiskProfile | undefined> => db.riskProfile.get('current'),
  save: (value: RiskProfile): Promise<string> => db.riskProfile.put(value),
};

export const settingsRepo = {
  get: async (): Promise<AppSettings> =>
    (await db.settings.get('current')) ?? {
      id: 'current',
      alertThresholdPct: 80,
      gradedReminderEnabled: true,
      backupReminderEnabled: true,
      backupReminderDays: 30,
    },
  save: (value: AppSettings): Promise<string> => db.settings.put(value),
};

export const appMetaRepo = {
  get: async (): Promise<AppMeta> =>
    (await db.appMeta.get('current')) ?? {
      id: 'current',
      firstUseNoticeAckAt: null,
      educationDisclaimerAckAt: null,
      stockDisclaimerAckAt: null,
      bankDisclaimerAckAt: null,
      lastBackupExportAt: null,
    },
  save: (value: AppMeta): Promise<string> => db.appMeta.put(value),
};
