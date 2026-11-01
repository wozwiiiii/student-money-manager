import { create } from 'zustand';
import { accountsRepo, snapshotsRepo } from '@/db/repositories';
import type { Account, AssetSnapshot } from '@/lib/types';
import { computeSnapshotTotalCents, findLatestEntry, sameMinuteKey } from '@/lib/assets';
import { newId, nowIso } from '@/lib/ids';

export interface SnapshotInput {
  takenAt: string;
  entries: { accountId: string; balanceCents: number; units?: number | null; nav?: number | null }[];
}

/** 账户与资产快照状态（01 §5.1/5.2；规则见 02 §2、§3） */
interface AssetsState {
  accounts: Account[];
  snapshots: AssetSnapshot[];
  loaded: boolean;
  load: () => Promise<void>;
  addAccount: (
    input: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ) => Promise<Account>;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id' | 'createdAt' | 'deletedAt'>>) => Promise<void>;
  /** 软删除（02 §2.4.7）：历史快照不变；关联收支记录保留原账户名并标「已删除」 */
  removeAccount: (id: string) => Promise<void>;
  /**
   * 调整账户显示顺序（05 §4.3）：在同资产类型分组内上移 / 下移，
   * 仅影响展示顺序，不影响任何统计。默认按创建先后排列。
   */
  moveAccount: (id: string, dir: 'up' | 'down') => Promise<void>;
  /** 恢复默认顺序（05 §7.3）：回到创建先后，仅恢复显示顺序 */
  resetAccountOrder: () => Promise<void>;
  /** 保存快照（新增或编辑；编辑时 updatedAt 留痕，02 §3.4.5） */
  saveSnapshot: (input: SnapshotInput, editId?: string) => Promise<void>;
  removeSnapshot: (id: string) => Promise<void>;
  /** 最近一次快照中某账户的值，无快照返回 null（01 §5.1 当前余额口径） */
  latestEntryOf: (accountId: string) => { takenAt: string; entry: AssetSnapshot['entries'][number] } | null;
}

function sortAsc(snapshots: AssetSnapshot[]): AssetSnapshot[] {
  return [...snapshots].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** 展示顺序（05 §4.3）：sortOrder 优先，未设置过顺序的按创建先后 */
function displayOrder(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  accounts: [],
  snapshots: [],
  loaded: false,
  load: async () => {
    const [accounts, snapshots] = await Promise.all([accountsRepo.all(), snapshotsRepo.allOrdered()]);
    set({ accounts: displayOrder(accounts.filter((a) => !a.deletedAt)), snapshots, loaded: true });
  },
  addAccount: async (input) => {
    // 创建时分配 sortOrder：保证"默认按创建先后排列"（05 §4.3）不依赖毫秒级 createdAt
    const maxSort = get().accounts.reduce((m, a) => Math.max(m, a.sortOrder ?? -1), -1);
    const account = await accountsRepo.add({ ...input, sortOrder: input.sortOrder ?? maxSort + 1 });
    await get().load();
    return account;
  },
  updateAccount: async (id, patch) => {
    const existing = await accountsRepo.get(id);
    if (!existing) return;
    await accountsRepo.save({ ...existing, ...patch, updatedAt: nowIso() });
    await get().load();
  },
  removeAccount: async (id) => {
    // 软删除：历史快照保持不变（02 §2.4.7），未来新快照不再包含该账户
    const existing = await accountsRepo.get(id);
    if (!existing) return;
    await accountsRepo.save({ ...existing, deletedAt: nowIso(), updatedAt: nowIso() });
    await get().load();
  },
  moveAccount: async (id, dir) => {
    const ordered = displayOrder(get().accounts);
    const from = ordered.findIndex((a) => a.id === id);
    if (from < 0) return;
    // 仅在同资产类型分组内移动（账户管理页按三类分组展示）
    let to = dir === 'up' ? from - 1 : from + 1;
    while (to >= 0 && to < ordered.length && ordered[to].assetType !== ordered[from].assetType) {
      to += dir === 'up' ? -1 : 1;
    }
    if (to < 0 || to >= ordered.length || ordered[to].assetType !== ordered[from].assetType) return;
    const next = [...ordered];
    [next[from], next[to]] = [next[to], next[from]];
    for (let i = 0; i < next.length; i++) {
      if (next[i].sortOrder !== i) await accountsRepo.save({ ...next[i], sortOrder: i, updatedAt: nowIso() });
    }
    await get().load();
  },
  resetAccountOrder: async () => {
    // 恢复创建先后：按 createdAt 排序后重写 sortOrder（05 §7.3：仅恢复显示顺序）
    const ordered = [...get().accounts].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].sortOrder !== i) await accountsRepo.save({ ...ordered[i], sortOrder: i, updatedAt: nowIso() });
    }
    await get().load();
  },
  saveSnapshot: async (input, editId) => {
    const { accounts, snapshots } = get();
    const included = new Set(accounts.filter((a) => a.includeInTotal).map((a) => a.id));
    const totalCents = computeSnapshotTotalCents(input.entries, included);

    // 同一分钟只允许一条快照（02 §3.4.3）：新增与编辑一并约束，编辑排除自身
    const conflict = snapshots.find(
      (s) => s.id !== editId && sameMinuteKey(s.takenAt) === sameMinuteKey(input.takenAt),
    );
    if (conflict) throw new Error('该时间已有快照，请调整时间或编辑原快照');

    if (editId) {
      const existing = await snapshotsRepo.get(editId);
      if (!existing) return;
      await snapshotsRepo.save({
        ...existing,
        takenAt: input.takenAt,
        entries: input.entries,
        totalCents,
        updatedAt: nowIso(),
      });
    } else {
      const now = nowIso();
      await snapshotsRepo.save({
        id: newId(),
        takenAt: input.takenAt,
        entries: input.entries,
        totalCents,
        createdAt: now,
        updatedAt: null,
      });
    }
    await get().load();
  },
  removeSnapshot: async (id) => {
    await snapshotsRepo.remove(id);
    await get().load();
  },
  latestEntryOf: (accountId) => {
    return findLatestEntry(sortAsc(get().snapshots), accountId);
  },
}));
