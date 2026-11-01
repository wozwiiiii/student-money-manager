import { db } from './database';
import { initDatabase } from './seed';
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
 * 备份导出与导入恢复（spec/08 §3.1、§3.2）。
 * - 导出范围：08 §2.2 清单 S1～S9 全量（含应用状态记录）
 * - 备份文件带 schemaVersion（AGENT.md §10.2 版本化预留），未来作为上云迁移载体
 * - 冲突处理"询问后覆盖，不合并"由调用方（设置页 UI）负责确认，本模块的 importBackup 直接以备份内容替换全部本地数据
 */

export const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_APP_ID = 'campus-finance-keeper';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: {
    accounts: Account[];
    snapshots: AssetSnapshot[];
    transactions: Transaction[];
    categories: Category[];
    mappingRules: MappingRule[];
    budgets: Budget[];
    customCycles: CustomCycle[];
    goals: SavingsGoal[];
    goalEntries: GoalEntry[];
    riskProfile: RiskProfile[];
    settings: AppSettings[];
    appMeta: AppMeta[];
  };
}

export type ImportResult =
  | {
      ok: true;
      counts: { accounts: number; transactions: number; snapshots: number; goals: number };
    }
  | { ok: false; error: string };

/** 生成全量备份文件对象（08 §3.1 导出范围 = S1～S9 全部） */
export async function exportBackup(): Promise<BackupFile> {
  const [
    accounts,
    snapshots,
    transactions,
    categories,
    mappingRules,
    budgets,
    customCycles,
    goals,
    goalEntries,
    riskProfile,
    settings,
    appMeta,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.snapshots.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.mappingRules.toArray(),
    db.budgets.toArray(),
    db.customCycles.toArray(),
    db.goals.toArray(),
    db.goalEntries.toArray(),
    db.riskProfile.toArray(),
    db.settings.toArray(),
    db.appMeta.toArray(),
  ]);
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      accounts,
      snapshots,
      transactions,
      categories,
      mappingRules,
      budgets,
      customCycles,
      goals,
      goalEntries,
      riskProfile,
      settings,
      appMeta,
    },
  };
}

/** 备份文件必须包含的数据表（08 §2.2 清单 S1～S9 全量） */
const BACKUP_DATA_KEYS = [
  'accounts',
  'snapshots',
  'transactions',
  'categories',
  'mappingRules',
  'budgets',
  'customCycles',
  'goals',
  'goalEntries',
  'riskProfile',
  'settings',
  'appMeta',
] as const;

/** 识别备份文件：非本应用导出或结构不符时返回错误文案（08 §3.2 步骤 1） */
export function validateBackupFile(raw: unknown): { ok: true; file: BackupFile } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '这不是本应用导出的备份文件，无法导入' };
  }
  const file = raw as Partial<BackupFile>;
  if (file.app !== BACKUP_APP_ID || typeof file.schemaVersion !== 'number' || typeof file.data !== 'object' || file.data === null) {
    return { ok: false, error: '这不是本应用导出的备份文件，无法导入' };
  }
  // 结构校验：S1～S9 每张表都必须是数组，缺表/类型不符按"结构不符"拒绝
  const data = file.data as Record<string, unknown>;
  if (!BACKUP_DATA_KEYS.every((key) => Array.isArray(data[key]))) {
    return { ok: false, error: '这不是本应用导出的备份文件，无法导入' };
  }
  if (file.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: '备份文件由更新版本的应用生成，当前版本无法导入' };
  }
  return { ok: true, file: file as BackupFile };
}

/**
 * 从备份文件恢复：以备份内容替换全部本地数据（08 §3.2 冲突口径"询问后覆盖，不合并"的"覆盖"执行体）。
 * 调用方须先完成冲突确认；本地为空时可直接调用。
 */
export async function importBackup(raw: unknown): Promise<ImportResult> {
  const validated = validateBackupFile(raw);
  if (!validated.ok) return validated;
  const { data } = validated.file;

  await db.transaction(
    'rw',
    [
      db.accounts,
      db.snapshots,
      db.transactions,
      db.categories,
      db.mappingRules,
      db.budgets,
      db.customCycles,
      db.goals,
      db.goalEntries,
      db.riskProfile,
      db.settings,
      db.appMeta,
    ],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.snapshots.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.mappingRules.clear(),
        db.budgets.clear(),
        db.customCycles.clear(),
        db.goals.clear(),
        db.goalEntries.clear(),
        db.riskProfile.clear(),
        db.settings.clear(),
        db.appMeta.clear(),
      ]);
      await Promise.all([
        db.accounts.bulkAdd(data.accounts),
        db.snapshots.bulkAdd(data.snapshots),
        db.transactions.bulkAdd(data.transactions),
        db.categories.bulkAdd(data.categories),
        db.mappingRules.bulkAdd(data.mappingRules),
        db.budgets.bulkAdd(data.budgets),
        db.customCycles.bulkAdd(data.customCycles),
        db.goals.bulkAdd(data.goals),
        db.goalEntries.bulkAdd(data.goalEntries),
        db.riskProfile.bulkAdd(data.riskProfile),
        db.settings.bulkAdd(data.settings),
        db.appMeta.bulkAdd(data.appMeta),
      ]);
    },
  );

  return {
    ok: true,
    counts: {
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      snapshots: data.snapshots.length,
      goals: data.goals.length,
    },
  };
}

/**
 * 本地是否已有用户数据（08 §3.2 导入冲突判定）：种子默认数据（内置分类/映射规则/默认设置）不算。
 * 用于区分"本地为空（首次使用或刚清空）直接恢复"与"本地已有数据须询问后覆盖"。
 */
export async function hasLocalUserData(): Promise<boolean> {
  const [accounts, snapshots, transactions, goals, goalEntries, customCycles, categories, mappingRules, budgets, riskProfile] =
    await Promise.all([
      db.accounts.toArray(),
      db.snapshots.toArray(),
      db.transactions.toArray(),
      db.goals.toArray(),
      db.goalEntries.toArray(),
      db.customCycles.toArray(),
      db.categories.toArray(),
      db.mappingRules.toArray(),
      db.budgets.toArray(),
      db.riskProfile.get('current'),
    ]);
  if (
    accounts.length + snapshots.length + transactions.length + goals.length + goalEntries.length + customCycles.length >
    0
  ) {
    return true;
  }
  // 分类 / 映射规则被用户修改过（重命名、停用、自定义新增）也算已有数据
  if (categories.some((c) => !c.builtin || c.disabled || (c.defaultName != null && c.name !== c.defaultName))) return true;
  if (mappingRules.some((r) => !r.builtin || !r.enabled)) return true;
  if (budgets.some((b) => b.totalBudgetCents != null || b.categoryBudgets.length > 0)) return true;
  if (riskProfile && (riskProfile.assessedAt != null || riskProfile.manuallyAdjusted)) return true;
  return false;
}

/**
 * 最近一次数据写入时间（08 §3.3 提醒触发条件"期间本地发生过任何数据写入"的判定依据）：
 * 取各表记录时间戳（createdAt/updatedAt）的最大值；无任何用户数据返回 null。
 */
export async function computeLastWriteAt(): Promise<string | null> {
  const [
    accounts,
    snapshots,
    transactions,
    categories,
    mappingRules,
    budgets,
    customCycles,
    goals,
    goalEntries,
    riskProfile,
    settings,
    appMeta,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.snapshots.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.mappingRules.toArray(),
    db.budgets.toArray(),
    db.customCycles.toArray(),
    db.goals.toArray(),
    db.goalEntries.toArray(),
    db.riskProfile.toArray(),
    db.settings.toArray(),
    db.appMeta.toArray(),
  ]);
  const stamps: string[] = [];
  for (const list of [accounts, snapshots, transactions, riskProfile, settings, appMeta]) {
    for (const row of list as { createdAt?: string; updatedAt?: string | null }[]) {
      if (row.createdAt) stamps.push(row.createdAt);
      if (row.updatedAt) stamps.push(row.updatedAt);
    }
  }
  for (const row of [...categories, ...mappingRules, ...budgets] as { updatedAt?: string }[]) {
    if (row.updatedAt) stamps.push(row.updatedAt);
  }
  for (const row of customCycles as { createdAt: string }[]) {
    stamps.push(row.createdAt);
  }
  for (const row of [...goals, ...goalEntries] as { createdAt: string; updatedAt?: string }[]) {
    stamps.push(row.createdAt);
    if (row.updatedAt) stamps.push(row.updatedAt);
  }
  return stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
}

/**
 * 清空全部数据（08 §2.5）：删除 S1～S9 全部，随后重建内置默认数据（内置分类、默认设置），
 * 应用回到首次使用状态（首次使用告知确认状态被清除，告知层将重现）。
 * 二次确认与"先导出备份再清空"快捷路径由 UI 层负责。
 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.accounts,
      db.snapshots,
      db.transactions,
      db.categories,
      db.mappingRules,
      db.budgets,
      db.customCycles,
      db.goals,
      db.goalEntries,
      db.riskProfile,
      db.settings,
      db.appMeta,
    ],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.snapshots.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.mappingRules.clear(),
        db.budgets.clear(),
        db.customCycles.clear(),
        db.goals.clear(),
        db.goalEntries.clear(),
        db.riskProfile.clear(),
        db.settings.clear(),
        db.appMeta.clear(),
      ]);
    },
  );
  await initDatabase();
}
