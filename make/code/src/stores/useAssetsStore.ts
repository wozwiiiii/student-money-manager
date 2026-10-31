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
  /** 保存快照（新增或编辑；编辑时 updatedAt 留痕，02 §3.4.5） */
  saveSnapshot: (input: SnapshotInput, editId?: string) => Promise<void>;
  removeSnapshot: (id: string) => Promise<void>;
  /** 最近一次快照中某账户的值，无快照返回 null（01 §5.1 当前余额口径） */
  latestEntryOf: (accountId: string) => { takenAt: string; entry: AssetSnapshot['entries'][number] } | null;
}

function sortAsc(snapshots: AssetSnapshot[]): AssetSnapshot[] {
  return [...snapshots].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  accounts: [],
  snapshots: [],
  loaded: false,
  load: async () => {
    const [accounts, snapshots] = await Promise.all([accountsRepo.all(), snapshotsRepo.allOrdered()]);
    set({ accounts: accounts.filter((a) => !a.deletedAt), snapshots, loaded: true });
  },
  addAccount: async (input) => {
    const account = await accountsRepo.add(input);
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
