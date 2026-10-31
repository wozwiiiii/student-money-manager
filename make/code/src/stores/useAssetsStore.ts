import { create } from 'zustand';
import { accountsRepo, snapshotsRepo } from '@/db/repositories';
import type { Account, AssetSnapshot } from '@/lib/types';
import { sumCents } from '@/lib/money';
import { newId, nowIso } from '@/lib/ids';

/** 账户与资产快照状态（01 §5.1/5.2） */
interface AssetsState {
  accounts: Account[];
  snapshots: AssetSnapshot[];
  loaded: boolean;
  load: () => Promise<void>;
  addAccount: (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id' | 'createdAt'>>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  /** 新增资产快照（01 §5.2：快照时间 + 各账户余额 + 总资产） */
  addSnapshot: (entries: { accountId: string; balanceCents: number }[]) => Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  accounts: [],
  snapshots: [],
  loaded: false,
  load: async () => {
    const [accounts, snapshots] = await Promise.all([accountsRepo.all(), snapshotsRepo.allOrdered()]);
    set({ accounts, snapshots, loaded: true });
  },
  addAccount: async (input) => {
    await accountsRepo.add(input);
    await get().load();
  },
  updateAccount: async (id, patch) => {
    const existing = await accountsRepo.get(id);
    if (!existing) return;
    await accountsRepo.save({ ...existing, ...patch, updatedAt: nowIso() });
    await get().load();
  },
  removeAccount: async (id) => {
    await accountsRepo.remove(id);
    await get().load();
  },
  addSnapshot: async (entries) => {
    const { accounts } = get();
    // 总资产 = 计入统计的账户余额之和（01 §5.2）
    const included = new Set(accounts.filter((a) => a.includeInTotal).map((a) => a.id));
    const totalCents = sumCents(entries.filter((e) => included.has(e.accountId)).map((e) => e.balanceCents));
    const snapshot: AssetSnapshot = {
      id: newId(),
      takenAt: nowIso(),
      entries,
      totalCents,
      createdAt: nowIso(),
    };
    await snapshotsRepo.save(snapshot);
    await get().load();
  },
}));
