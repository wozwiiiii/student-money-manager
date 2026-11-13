import { describe, expect, it } from 'vitest';
import { collectLocalRecords, effectiveUpdatedAt, mergeRemoteInto, type SyncData, type SyncRecordView } from './sync';

/**
 * 云同步 LWW 合并（08 §9.2 [TBD-13]：记录级最后写入胜出）。
 */

function emptyData(): SyncData {
  return {
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
  };
}

const rec = (over: Partial<SyncRecordView> = {}): SyncRecordView => ({
  table: 'transactions',
  recordId: 'tx1',
  payload: { id: 'tx1', amountCents: 100 },
  updatedAt: '2026-11-13T02:00:00.000Z',
  deleted: false,
  ...over,
});

describe('effectiveUpdatedAt（LWW 时间依据）', () => {
  it('updatedAt 优先，退回 createdAt，均无则最旧', () => {
    expect(effectiveUpdatedAt({ updatedAt: '2026-01-02T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' })).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(effectiveUpdatedAt({ createdAt: '2026-01-01T00:00:00.000Z' })).toBe('2026-01-01T00:00:00.000Z');
    expect(effectiveUpdatedAt({})).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('collectLocalRecords', () => {
  it('收集全部表的记录并带 LWW 时间依据', () => {
    const data = emptyData();
    data.goals = [{ id: 'g1', updatedAt: '2026-11-13T01:00:00.000Z' } as never];
    data.settings = [{ id: 'current' } as never];
    const records = collectLocalRecords(data);
    expect(records).toHaveLength(2);
    const goal = records.find((r) => r.table === 'goals')!;
    expect(goal.recordId).toBe('g1');
    expect(goal.updatedAt).toBe('2026-11-13T01:00:00.000Z');
    expect(goal.deleted).toBe(false);
  });
});

describe('mergeRemoteInto（08 §9.2 LWW）', () => {
  it('本地不存在：远端非删除则追加', () => {
    const result = mergeRemoteInto(emptyData(), [rec()]);
    expect(result.applied).toBe(1);
    expect(result.data.transactions).toHaveLength(1);
  });

  it('本地较新则保留本地，远端较新则覆盖，同龄取远端', () => {
    const local = emptyData();
    local.transactions = [{ id: 'tx1', amountCents: 1, updatedAt: '2026-11-13T03:00:00.000Z' } as never];

    // 远端较旧 → 保留
    const older = mergeRemoteInto(local, [rec({ updatedAt: '2026-11-13T02:00:00.000Z' })]);
    expect(older.kept).toBe(1);
    expect((older.data.transactions[0] as { amountCents: number }).amountCents).toBe(1);

    // 远端较新 → 覆盖
    const newer = mergeRemoteInto(local, [rec({ updatedAt: '2026-11-13T04:00:00.000Z' })]);
    expect(newer.applied).toBe(1);
    expect((newer.data.transactions[0] as { amountCents: number }).amountCents).toBe(100);

    // 同龄 → 取远端（>=）
    const same = mergeRemoteInto(local, [rec({ updatedAt: '2026-11-13T03:00:00.000Z' })]);
    expect(same.applied).toBe(1);
    expect((same.data.transactions[0] as { amountCents: number }).amountCents).toBe(100);
  });

  it('删除墓碑：较新墓碑删除本地记录，本地无记录时忽略', () => {
    const local = emptyData();
    local.transactions = [{ id: 'tx1', updatedAt: '2026-11-13T01:00:00.000Z' } as never];
    const result = mergeRemoteInto(local, [rec({ updatedAt: '2026-11-13T05:00:00.000Z', deleted: true })]);
    expect(result.removed).toBe(1);
    expect(result.data.transactions).toHaveLength(0);

    const noLocal = mergeRemoteInto(emptyData(), [rec({ deleted: true })]);
    expect(noLocal.removed).toBe(0);
    expect(noLocal.data.transactions).toHaveLength(0);
  });

  it('旧墓碑不删除较新的本地记录', () => {
    const local = emptyData();
    local.transactions = [{ id: 'tx1', updatedAt: '2026-11-13T06:00:00.000Z' } as never];
    const result = mergeRemoteInto(local, [rec({ updatedAt: '2026-11-13T05:00:00.000Z', deleted: true })]);
    expect(result.kept).toBe(1);
    expect(result.data.transactions).toHaveLength(1);
  });
});
