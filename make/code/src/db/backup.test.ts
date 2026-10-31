import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { initDatabase } from './seed';
import { clearAllData, exportBackup, importBackup, validateBackupFile } from './backup';
import { accountsRepo, appMetaRepo, categoriesRepo, transactionsRepo } from './repositories';
import type { Transaction } from '@/lib/types';

async function seedSampleData() {
  const account = await accountsRepo.add({
    name: '余额宝',
    assetType: 'cash',
    includeInTotal: true,
  });
  const now = new Date().toISOString();
  const tx: Transaction = {
    id: crypto.randomUUID(),
    date: '2026-10-01',
    direction: 'expense',
    amountCents: 1250,
    categoryId: null,
    accountId: account.id,
    counterAccountId: null,
    source: 'manual',
    memo: '食堂午饭',
    createdAt: now,
    updatedAt: now,
  };
  await transactionsRepo.save(tx);
  return { account, tx };
}

describe('备份导出与导入恢复（08 §3.1/3.2）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initDatabase();
  });

  it('导出覆盖 S1～S9 全量并带 schemaVersion', async () => {
    const { account, tx } = await seedSampleData();
    const backup = await exportBackup();

    expect(backup.app).toBe('campus-finance-keeper');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.data.accounts.map((a) => a.id)).toContain(account.id);
    expect(backup.data.transactions.map((t) => t.id)).toContain(tx.id);
    // S4/S8/S9（内置分类、设置、应用状态）同样在导出范围内
    expect(backup.data.categories.length).toBeGreaterThan(0);
    expect(backup.data.settings.length).toBe(1);
    expect(backup.data.appMeta.length).toBe(1);
  });

  it('导出 → 清空 → 导入，数据完整恢复', async () => {
    const { account, tx } = await seedSampleData();
    const backup = await exportBackup();

    await clearAllData();
    expect((await accountsRepo.all()).length).toBe(0);
    expect((await transactionsRepo.all()).length).toBe(0);

    const result = await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts.accounts).toBe(1);
      expect(result.counts.transactions).toBe(1);
    }
    const restoredAccounts = await accountsRepo.all();
    expect(restoredAccounts[0].name).toBe(account.name);
    const restoredTx = await transactionsRepo.all();
    expect(restoredTx[0].amountCents).toBe(tx.amountCents);
    expect(restoredTx[0].memo).toBe('食堂午饭');
  });

  it('导入不合并（08 §3.2 冲突口径）：以备份内容替换全部本地数据', async () => {
    await seedSampleData();
    const backup = await exportBackup();

    // 本地再新增一条记录，模拟"本地已有数据"
    await seedSampleData();
    expect((await transactionsRepo.all()).length).toBe(2);

    await importBackup(JSON.parse(JSON.stringify(backup)));
    expect((await transactionsRepo.all()).length).toBe(1);
  });

  it('拒绝无法识别的文件，不发生数据变化', async () => {
    const { tx } = await seedSampleData();
    const result = await importBackup({ hello: 'world' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('这不是本应用导出的备份文件，无法导入');
    }
    const txs = await transactionsRepo.all();
    expect(txs.map((t) => t.id)).toContain(tx.id);
  });

  it('拒绝更高 schemaVersion 的备份', async () => {
    const backup = await exportBackup();
    const result = validateBackupFile({ ...backup, schemaVersion: 999 });
    expect(result.ok).toBe(false);
  });

  it('拒绝 data 结构不符（缺全部数组）的文件，返回错误而非抛异常（08 §3.2 步骤 1）', async () => {
    const { tx } = await seedSampleData();
    const result = await importBackup({
      app: 'campus-finance-keeper',
      schemaVersion: 1,
      data: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('这不是本应用导出的备份文件，无法导入');
    }
    // 本地数据不受影响
    const txs = await transactionsRepo.all();
    expect(txs.map((t) => t.id)).toContain(tx.id);
  });

  it('拒绝 data 数组不完整的文件（如缺 transactions）', async () => {
    await seedSampleData();
    const backup = await exportBackup();
    const broken = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>;
    (broken.data as Record<string, unknown>).transactions = undefined;
    const result = await importBackup(broken);
    expect(result.ok).toBe(false);
  });
});

describe('清空全部数据（08 §2.5）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initDatabase();
  });

  it('清空用户数据并重建内置默认数据，回到首次使用状态', async () => {
    await seedSampleData();
    const metaBefore = await appMetaRepo.get();
    await appMetaRepo.save({ ...metaBefore, firstUseNoticeAckAt: new Date().toISOString() });

    await clearAllData();

    expect((await accountsRepo.all()).length).toBe(0);
    expect((await transactionsRepo.all()).length).toBe(0);
    // 内置分类重建
    expect((await categoriesRepo.all()).length).toBeGreaterThan(0);
    // 首次使用告知确认状态清除，告知层将重现（08 §7）
    expect((await appMetaRepo.get()).firstUseNoticeAckAt).toBeNull();
  });
});
