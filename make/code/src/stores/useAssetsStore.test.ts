import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { accountsRepo } from '@/db/repositories';
import { useAssetsStore } from './useAssetsStore';
import type { Account } from '@/lib/types';

/**
 * 账户与资产快照的领域行为（02 §2/§3）：
 * 快照总资产口径、同分钟唯一、编辑留痕、软删除、当前余额取值。
 */

async function addAccount(name: string, includeInTotal = true): Promise<Account> {
  const { addAccount: add } = useAssetsStore.getState();
  return add({ name, assetType: 'cash', includeInTotal });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useAssetsStore.setState({ accounts: [], snapshots: [], loaded: false });
  await useAssetsStore.getState().load();
});

describe('saveSnapshot 总资产口径（02 §3.6）', () => {
  it('只合计计入总资产的账户，保存时固定 totalCents', async () => {
    const a = await addAccount('计入账户', true);
    const b = await addAccount('不计入账户', false);
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-01T10:00:00.000Z',
      entries: [
        { accountId: a.id, balanceCents: 1000 },
        { accountId: b.id, balanceCents: 9999 },
      ],
    });
    const saved = useAssetsStore.getState().snapshots[0];
    expect(saved.totalCents).toBe(1000);
  });

  it('编辑快照后 totalCents 重算（02 §3.4.5）', async () => {
    const a = await addAccount('a', true);
    await useAssetsStore.getState().saveSnapshot(
      { takenAt: '2026-01-01T10:00:00.000Z', entries: [{ accountId: a.id, balanceCents: 1000 }] },
    );
    const saved = useAssetsStore.getState().snapshots[0];
    await useAssetsStore.getState().saveSnapshot(
      { takenAt: '2026-01-01T10:00:00.000Z', entries: [{ accountId: a.id, balanceCents: 2500 }] },
      saved.id,
    );
    const edited = useAssetsStore.getState().snapshots[0];
    expect(edited.totalCents).toBe(2500);
  });
});

describe('同分钟唯一（02 §3.4.3）', () => {
  it('同一分钟新增第二条快照报错', async () => {
    const a = await addAccount('a');
    const input = { entries: [{ accountId: a.id, balanceCents: 1000 }] };
    await useAssetsStore.getState().saveSnapshot({ takenAt: '2026-01-01T10:00:30.000Z', ...input });
    await expect(
      useAssetsStore.getState().saveSnapshot({ takenAt: '2026-01-01T10:00:45.000Z', ...input }),
    ).rejects.toThrow('该时间已有快照，请调整时间或编辑原快照');
    expect(useAssetsStore.getState().snapshots).toHaveLength(1);
  });

  it('编辑快照改到其他快照所在分钟同样报错', async () => {
    const a = await addAccount('a');
    const input = { entries: [{ accountId: a.id, balanceCents: 1000 }] };
    await useAssetsStore.getState().saveSnapshot({ takenAt: '2026-01-01T10:00:00.000Z', ...input });
    await useAssetsStore.getState().saveSnapshot({ takenAt: '2026-01-02T10:00:00.000Z', ...input });
    const [first, second] = useAssetsStore.getState().snapshots;
    // 把第二条编辑到第一条所在的分钟
    await expect(
      useAssetsStore.getState().saveSnapshot(
        { takenAt: '2026-01-01T10:00:59.000Z', entries: second.entries },
        second.id,
      ),
    ).rejects.toThrow('该时间已有快照，请调整时间或编辑原快照');
    // 时间保持原样不受影响
    expect(useAssetsStore.getState().snapshots.find((s) => s.id === first.id)?.takenAt).toBe(
      '2026-01-01T10:00:00.000Z',
    );
  });

  it('编辑快照保持自身时间不触发冲突，且 updatedAt 留痕（02 §3.4.5）', async () => {
    const a = await addAccount('a');
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-01T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 1000 }],
    });
    const saved = useAssetsStore.getState().snapshots[0];
    expect(saved.updatedAt).toBeNull();
    await useAssetsStore.getState().saveSnapshot(
      { takenAt: '2026-01-01T10:00:00.000Z', entries: [{ accountId: a.id, balanceCents: 2000 }] },
      saved.id,
    );
    const edited = useAssetsStore.getState().snapshots[0];
    expect(edited.updatedAt).not.toBeNull();
    expect(edited.createdAt).toBe(saved.createdAt);
  });
});

describe('账户软删除（02 §2.4.7）', () => {
  it('软删除后不在使用中列表，历史快照保持不变', async () => {
    const a = await addAccount('要删除的账户');
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-01T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 1234 }],
    });
    const before = useAssetsStore.getState().snapshots[0];

    await useAssetsStore.getState().removeAccount(a.id);

    // 使用中列表不再包含
    expect(useAssetsStore.getState().accounts.map((x) => x.id)).not.toContain(a.id);
    // 软删除标记写入
    const inDb = await accountsRepo.get(a.id);
    expect(inDb?.deletedAt).not.toBeNull();
    // 历史快照的余额与总资产不改动
    const after = useAssetsStore.getState().snapshots[0];
    expect(after.entries).toEqual(before.entries);
    expect(after.totalCents).toBe(before.totalCents);
  });
});

describe('当前余额取值（01 §5.1：取自最近一次资产快照）', () => {
  it('取最近一次快照中的值，无快照返回 null', async () => {
    const a = await addAccount('a');
    expect(useAssetsStore.getState().latestEntryOf(a.id)).toBeNull();
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-01T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 100 }],
    });
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-08T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 200 }],
    });
    expect(useAssetsStore.getState().latestEntryOf(a.id)?.entry.balanceCents).toBe(200);
  });

  it('删除最近一次快照后回退至更早一次的值（02 §3.4.6）', async () => {
    const a = await addAccount('a');
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-01T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 100 }],
    });
    await useAssetsStore.getState().saveSnapshot({
      takenAt: '2026-01-08T10:00:00.000Z',
      entries: [{ accountId: a.id, balanceCents: 200 }],
    });
    const latest = useAssetsStore.getState().snapshots[1];
    await useAssetsStore.getState().removeSnapshot(latest.id);
    expect(useAssetsStore.getState().latestEntryOf(a.id)?.entry.balanceCents).toBe(100);
  });
});
