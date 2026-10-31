import { create } from 'zustand';
import { transactionsRepo } from '@/db/repositories';
import type { Transaction } from '@/lib/types';
import { newId, nowIso } from '@/lib/ids';

/** 收支记录状态（01 §5.3） */
interface TransactionsState {
  transactions: Transaction[];
  loaded: boolean;
  load: () => Promise<void>;
  addTransaction: (
    input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>;
  updateTransaction: (
    id: string,
    patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
  ) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  transactions: [],
  loaded: false,
  load: async () => {
    set({ transactions: await transactionsRepo.all(), loaded: true });
  },
  addTransaction: async (input) => {
    const now = nowIso();
    await transactionsRepo.save({ ...input, id: newId(), createdAt: now, updatedAt: now });
    await get().load();
  },
  updateTransaction: async (id, patch) => {
    const existing = await transactionsRepo.get(id);
    if (!existing) return;
    await transactionsRepo.save({ ...existing, ...patch, updatedAt: nowIso() });
    await get().load();
  },
  removeTransaction: async (id) => {
    await transactionsRepo.remove(id);
    await get().load();
  },
}));
