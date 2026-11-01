import { describe, expect, it } from 'vitest';
import { daysSince, makeBackupFilename, shouldRemindBackup } from './backupReminder';

/**
 * 备份提醒判定与文件命名（08 §3.1、§3.3）。
 */

const NOW = '2026-11-01T10:00:00.000Z';

const base = {
  enabled: true,
  reminderDays: 30,
  lastBackupExportAt: null as string | null,
  lastWriteAt: null as string | null,
  dismissedAt: null as string | null,
  now: NOW,
};

describe('daysSince', () => {
  it('按自然日向下取整，不足一天为 0', () => {
    expect(daysSince('2026-11-01T09:00:00.000Z', NOW)).toBe(0);
    expect(daysSince('2026-10-31T11:00:00.000Z', NOW)).toBe(0);
    expect(daysSince('2026-10-31T09:00:00.000Z', NOW)).toBe(1);
    expect(daysSince('2026-10-02T10:00:00.000Z', NOW)).toBe(30);
  });
});

describe('shouldRemindBackup（08 §3.3）', () => {
  it('开关关闭时不提醒', () => {
    expect(
      shouldRemindBackup({
        ...base,
        enabled: false,
        lastWriteAt: '2026-10-30T10:00:00.000Z',
        lastBackupExportAt: '2025-01-01T10:00:00.000Z',
      }).remind,
    ).toBe(false);
  });

  it('期间无任何数据写入时不提醒', () => {
    expect(shouldRemindBackup({ ...base, lastBackupExportAt: '2025-01-01T10:00:00.000Z' }).remind).toBe(false);
  });

  it('已导出且未超周期不提醒，超周期且有写入则提醒并给出天数', () => {
    const write = '2026-10-30T10:00:00.000Z';
    expect(
      shouldRemindBackup({ ...base, lastWriteAt: write, lastBackupExportAt: '2026-10-15T10:00:00.000Z' }).remind,
    ).toBe(false);
    const decision = shouldRemindBackup({
      ...base,
      lastWriteAt: write,
      lastBackupExportAt: '2026-09-20T10:00:00.000Z',
    });
    expect(decision.remind).toBe(true);
    expect(decision.overdueDays).toBe(42);
    expect(decision.neverExported).toBe(false);
  });

  it('从未导出过但有数据写入时提醒（neverExported）', () => {
    const decision = shouldRemindBackup({ ...base, lastWriteAt: '2026-10-30T10:00:00.000Z' });
    expect(decision.remind).toBe(true);
    expect(decision.neverExported).toBe(true);
    expect(decision.overdueDays).toBeNull();
  });

  it('点击"关闭本次提醒"后本周期内不提醒，下个周期到达后再提醒', () => {
    const write = '2026-10-30T10:00:00.000Z';
    // 20 天前关闭过（周期 30）→ 不提醒
    expect(
      shouldRemindBackup({
        ...base,
        lastWriteAt: write,
        lastBackupExportAt: null,
        dismissedAt: '2026-10-12T10:00:00.000Z',
      }).remind,
    ).toBe(false);
    // 35 天前关闭过 → 已进入下个周期，再次提醒
    expect(
      shouldRemindBackup({
        ...base,
        lastWriteAt: write,
        lastBackupExportAt: null,
        dismissedAt: '2026-09-27T10:00:00.000Z',
      }).remind,
    ).toBe(true);
  });
});

describe('makeBackupFilename（08 §3.1 [TBD-7]）', () => {
  it('默认文件名 = 产品名 + 日期，同日多次导出追加序号', () => {
    expect(makeBackupFilename('20261101', 0)).toBe('校园理财管家-备份-20261101.json');
    expect(makeBackupFilename('20261101', 1)).toBe('校园理财管家-备份-20261101-1.json');
    expect(makeBackupFilename('20261101', 2)).toBe('校园理财管家-备份-20261101-2.json');
  });
});
