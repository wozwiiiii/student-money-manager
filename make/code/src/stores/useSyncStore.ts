import { create } from 'zustand';
import { db } from '@/db/database';
import {
  buildSyncIndex,
  buildTombstones,
  collectLocalRecords,
  mergeRemoteInto,
  SYNC_TABLES,
  type SyncData,
  type SyncIndex,
  type SyncTable,
} from '@/lib/sync';
import { syncApi, SyncApiError } from '@/lib/syncApi';
import { setSyncTrigger } from '@/lib/syncScheduler';
import { nowIso } from '@/lib/ids';

/**
 * 账号与云同步状态（08 §9：注册登录、LWW 同步、登出、注销）。
 * 登录态令牌持久化于 localStorage（[TBD-18] 实现细节）；本地 IndexedDB 仍是主存储，
 * 同步失败不影响本地数据（08 §9.2）。
 */
const AUTH_STORAGE_KEY = 'campus-finance-keeper.auth';
const AUTO_SYNC_DEBOUNCE_MS = 5_000;

interface AuthPersisted {
  token: string;
  identifier: string;
}

function loadAuth(): AuthPersisted | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthPersisted) : null;
  } catch {
    return null;
  }
}

/** 删除传播索引的存储 key（按登录标识隔离，防止串号） */
function indexKey(identifier: string): string {
  return `${AUTH_STORAGE_KEY}.syncIndex:${identifier}`;
}

function loadSyncIndex(identifier: string): SyncIndex {
  try {
    const raw = localStorage.getItem(indexKey(identifier));
    return raw ? (JSON.parse(raw) as SyncIndex) : {};
  } catch {
    return {};
  }
}

function saveSyncIndex(identifier: string, index: SyncIndex): void {
  localStorage.setItem(indexKey(identifier), JSON.stringify(index));
}

interface SyncState {
  identifier: string | null;
  token: string | null;
  lastSyncAt: string | null;
  syncing: boolean;
  lastError: string | null;
  register: (identifier: string, password: string) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 注销账号（08 §9.4）：删除账号与云端副本；本机数据保留 */
  deleteAccount: () => Promise<void>;
  /** 全量 LWW 同步（08 §9.2）：拉取合并 → 推送；幂等 */
  syncNow: () => Promise<void>;
  /** 清空云端数据副本（08 §2.5 清空全部数据时登录模式使用）：为本地全部记录推送删除墓碑 */
  wipeCloud: () => Promise<void>;
  /** 数据变更后调度自动同步（去抖） */
  markDirty: () => void;
  /** 启动时从 localStorage 恢复登录态；已登录则做一次同步 */
  restore: () => Promise<void>;
}

async function readLocalData(): Promise<SyncData> {
  const [accounts, snapshots, transactions, categories, mappingRules, budgets, customCycles, goals, goalEntries, riskProfile, settings, appMeta] =
    await Promise.all([
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
  return { accounts, snapshots, transactions, categories, mappingRules, budgets, customCycles, goals, goalEntries, riskProfile, settings, appMeta };
}

/** 合并结果写回本地：原样保留 payload 的时间戳（不得刷新，否则破坏 LWW 依据） */
async function writeLocalData(data: SyncData): Promise<void> {
  await db.transaction('rw', SYNC_TABLES.map((t) => db[t] as never), async () => {
    for (const table of SYNC_TABLES) {
      const target = db[table as SyncTable] as unknown as {
        clear: () => Promise<void>;
        bulkPut: (rows: unknown[]) => Promise<void>;
      };
      await target.clear();
      await target.bulkPut(data[table as SyncTable]);
    }
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useSyncStore = create<SyncState>((set, get) => {
  const persistAuth = (auth: AuthPersisted | null) => {
    if (auth) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
    set({ token: auth?.token ?? null, identifier: auth?.identifier ?? null });
  };

  const doSync = async (): Promise<void> => {
    const { token, identifier } = get();
    if (!token || !identifier || get().syncing) return;
    set({ syncing: true, lastError: null });
    try {
      // 1. 拉取远端并按 LWW 合并入本地
      const { records } = await syncApi.pull(token);
      const local = await readLocalData();
      const merged = mergeRemoteInto(local, records);
      if (merged.applied > 0 || merged.removed > 0) {
        await writeLocalData(merged.data);
        // 刷新各 store 使页面即时反映（08 §9.2）
        const { reloadAllStores } = await import('@/stores/reloadAll');
        await reloadAllStores();
      }
      // 2. 删除传播：上次同步索引中已消失的记录生成墓碑（08 §9.2）
      const tombstones = buildTombstones(loadSyncIndex(identifier), merged.data, nowIso());
      // 3. 推送本地全量 + 墓碑（LWW 幂等：较旧的写入服务端会跳过）
      await syncApi.push(token, [...collectLocalRecords(merged.data), ...tombstones]);
      saveSyncIndex(identifier, buildSyncIndex(merged.data));
      set({ lastSyncAt: nowIso(), syncing: false });
    } catch (e) {
      // 同步失败不影响本地数据（08 §9.2）：提示后下次再试
      set({
        syncing: false,
        lastError: e instanceof SyncApiError ? e.message : '同步失败，将在下次打开时重试',
      });
    }
  };

  // store 写操作经 scheduleSync() 触发去抖自动同步（08 §9.2）
  setSyncTrigger(() => {
    if (!get().token) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void doSync(), AUTO_SYNC_DEBOUNCE_MS);
  });

  return {
    identifier: loadAuth()?.identifier ?? null,
    token: loadAuth()?.token ?? null,
    lastSyncAt: null,
    syncing: false,
    lastError: null,
    register: async (identifier, password) => {
      const auth = await syncApi.register(identifier, password);
      persistAuth(auth);
      // 登录态立即可用；首次同步转后台执行（08 §9.2 登录成功后拉取合并），不阻塞调用方
      void doSync();
    },
    login: async (identifier, password) => {
      const auth = await syncApi.login(identifier, password);
      persistAuth(auth);
      void doSync();
    },
    logout: async () => {
      const { token } = get();
      if (token) {
        try {
          await syncApi.logout(token);
        } catch {
          // 网络失败也允许本地登出（令牌最终过期，08 §9.3）
        }
      }
      persistAuth(null);
    },
    deleteAccount: async () => {
      const { token } = get();
      if (token) await syncApi.deleteAccount(token);
      persistAuth(null);
    },
    syncNow: doSync,
    wipeCloud: async () => {
      const { token, identifier } = get();
      if (!token || !identifier) return;
      // 为本地全部记录生成删除墓碑推送到云端（08 §2.5：清空时云端副本一并删除）
      const local = await readLocalData();
      const tombstones = buildTombstones(buildSyncIndex(local), {
        accounts: [],
        snapshots: [],
        transactions: [],
        categories: [],
        mappingRules: [],
        budgets: [],
        customCycles: [],
        goals: [],
        goalEntries: [],
        riskProfile: [],
        settings: [],
        appMeta: [],
      }, nowIso());
      await syncApi.push(token, tombstones);
      localStorage.removeItem(indexKey(identifier));
    },
    markDirty: () => {
      if (!get().token) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void doSync(), AUTO_SYNC_DEBOUNCE_MS);
    },
    restore: async () => {
      if (get().token) await doSync();
    },
  };
});
