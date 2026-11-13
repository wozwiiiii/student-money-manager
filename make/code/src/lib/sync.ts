/**
 * 云同步纯逻辑（08 §9.2）：记录级"最后写入胜出"（LWW）合并。
 * [TBD-13] LWW 为推断性简化方案，待评审确认；不提供逐条冲突解决界面。
 * 本地数据结构与备份文件同源（08 §2.2 S1～S9），同步范围为下表 12 张表（A1 账号信息不同步）。
 */
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
} from './types';

/** 同步表名（与备份文件 data 的键、后端 ALLOWED_TABLES 同源） */
export const SYNC_TABLES = [
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

export type SyncTable = (typeof SYNC_TABLES)[number];

/** 同步数据集：12 张表的记录数组（与备份文件 data 同构） */
export interface SyncData {
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
}

/** 一条同步记录（后端 sync_records 的行视图） */
export interface SyncRecordView {
  table: SyncTable;
  recordId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  deleted: boolean;
}

/** 无任何时间戳的旧数据视为最旧（08 §9.2 LWW 依据：记录最近修改时间） */
const EPOCH = '1970-01-01T00:00:00.000Z';

/** 记录的 LWW 依据：updatedAt 优先，退回 createdAt，均无则 epoch（最旧） */
export function effectiveUpdatedAt(record: Record<string, unknown>): string {
  const u = record.updatedAt;
  if (typeof u === 'string' && u) return u;
  const c = record.createdAt;
  if (typeof c === 'string' && c) return c;
  return EPOCH;
}

/** 本地全量 → 同步记录（push 用） */
export function collectLocalRecords(data: SyncData): SyncRecordView[] {
  const out: SyncRecordView[] = [];
  for (const table of SYNC_TABLES) {
    for (const raw of data[table] as { id: string }[]) {
      const record = raw as unknown as Record<string, unknown>;
      out.push({
        table,
        recordId: String(record.id),
        payload: record,
        updatedAt: effectiveUpdatedAt(record),
        deleted: false,
      });
    }
  }
  return out;
}

/** 上次同步后的本地记录索引：{ 表名: { 记录 id: 时间依据 } }（存 localStorage，用于删除传播） */
export type SyncIndex = Partial<Record<SyncTable, Record<string, string>>>;

/** 由本地数据集建立同步索引 */
export function buildSyncIndex(data: SyncData): SyncIndex {
  const index: SyncIndex = {};
  for (const table of SYNC_TABLES) {
    const map: Record<string, string> = {};
    for (const raw of data[table] as { id: string }[]) {
      const record = raw as unknown as Record<string, unknown>;
      map[String(record.id)] = effectiveUpdatedAt(record);
    }
    index[table] = map;
  }
  return index;
}

/**
 * 本地硬删除的传播（08 §9.2 删除墓碑）：上次同步索引中存在、当前本地已消失的记录，
 * 生成 deleted=true 的墓碑（时间取当前时刻——删除动作发生在现在）。
 */
export function buildTombstones(prev: SyncIndex, current: SyncData, now: string): SyncRecordView[] {
  const out: SyncRecordView[] = [];
  const currentIds = new Set<string>();
  for (const table of SYNC_TABLES) {
    for (const raw of current[table] as { id: string }[]) {
      currentIds.add(`${table}:${String((raw as unknown as Record<string, unknown>).id)}`);
    }
  }
  for (const table of SYNC_TABLES) {
    for (const [recordId] of Object.entries(prev[table] ?? {})) {
      if (!currentIds.has(`${table}:${recordId}`)) {
        out.push({ table, recordId, payload: { id: recordId }, updatedAt: now, deleted: true });
      }
    }
  }
  return out;
}

export interface MergeResult {
  data: SyncData;
  /** 远端较新、已并入本地（含按墓碑删除）的记录数 */
  applied: number;
  /** 本地较新或同龄、保留本地的记录数 */
  kept: number;
  /** 按远端墓碑从本地移除的记录数 */
  removed: number;
}

/**
 * 远端记录并入本地数据集（LWW，08 §9.2 [TBD-13]）：
 * - 本地不存在该记录：远端非删除 → 追加；删除墓碑 → 忽略
 * - 本地存在：远端较新（>=，同龄取远端）→ 采用远端（deleted 则删除本地）；本地较新 → 保留
 */
export function mergeRemoteInto(local: SyncData, remote: SyncRecordView[]): MergeResult {
  const data = {
    accounts: [...local.accounts],
    snapshots: [...local.snapshots],
    transactions: [...local.transactions],
    categories: [...local.categories],
    mappingRules: [...local.mappingRules],
    budgets: [...local.budgets],
    customCycles: [...local.customCycles],
    goals: [...local.goals],
    goalEntries: [...local.goalEntries],
    riskProfile: [...local.riskProfile],
    settings: [...local.settings],
    appMeta: [...local.appMeta],
  } as SyncData;

  let applied = 0;
  let kept = 0;
  let removed = 0;

  for (const rec of remote) {
    const list = data[rec.table] as unknown as Record<string, unknown>[];
    const idx = list.findIndex((r) => String(r.id) === rec.recordId);
    const localUpdatedAt = idx >= 0 ? effectiveUpdatedAt(list[idx]) : null;

    if (localUpdatedAt !== null && localUpdatedAt > rec.updatedAt) {
      kept += 1;
      continue;
    }
    if (rec.deleted) {
      if (idx >= 0) {
        list.splice(idx, 1);
        removed += 1;
      } else {
        kept += 1;
      }
      continue;
    }
    const payload = rec.payload;
    if (idx >= 0) list[idx] = payload;
    else list.push(payload);
    applied += 1;
  }

  return { data, applied, kept, removed };
}
