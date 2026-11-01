/**
 * 备份提醒判定与备份文件命名（spec/08 §3.1、§3.3）。
 * 触发条件（08 §3.3）：距最近一次成功导出备份的天数超过提醒周期，且期间本地发生过任何数据写入。
 * 默认开启、周期 30 天为 [Assumption, TBD-9]（08 §3.3）。
 */

export interface BackupReminderInput {
  /** 提醒功能总开关（AppSettings.backupReminderEnabled） */
  enabled: boolean;
  /** 提醒周期（天，AppSettings.backupReminderDays） */
  reminderDays: number;
  /** 最近一次成功导出时间（ISO），从未导出为 null */
  lastBackupExportAt: string | null;
  /** 最近一次数据写入时间（ISO），从未写入为 null */
  lastWriteAt: string | null;
  /** 上次点击"关闭本次提醒"的时间（ISO），未点过为 null */
  dismissedAt: string | null;
  /** 当前时刻（ISO） */
  now: string;
}

export interface BackupReminderDecision {
  remind: boolean;
  /** 已超过 N 天未备份（N）；从未导出过备份时为 null */
  overdueDays: number | null;
  /** 是否从未导出过备份（提醒文案区分，08 §3.3 文案为"已超过 N 天未备份"） */
  neverExported: boolean;
}

/** 两个 ISO 时间之间的自然日数（now − from，向下取整，不足一天为 0） */
export function daysSince(from: string, now: string): number {
  const ms = new Date(now).getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * 是否应展示定期备份提醒（08 §3.3）。
 * - 开关关闭：不提醒；
 * - 期间无任何数据写入：不提醒（提醒的目的是降低"有新数据未备份"的风险积累）；
 * - 距最近导出未超周期：不提醒；
 * - "关闭本次提醒"后：本周期内不再提醒，下个提醒周期到达后再次提醒（08 §3.3 结果与状态变化）。
 */
export function shouldRemindBackup(input: BackupReminderInput): BackupReminderDecision {
  const { enabled, reminderDays, lastBackupExportAt, lastWriteAt, dismissedAt, now } = input;
  const neverExported = lastBackupExportAt === null;
  const base: BackupReminderDecision = { remind: false, overdueDays: null, neverExported };
  if (!enabled) return base;
  // 期间没有发生过任何数据写入则不提醒
  if (lastWriteAt === null) return base;
  // 从未导出：视为超过周期（备份建议义务）；已导出：须实际超过提醒周期
  const overdueDays = lastBackupExportAt === null ? null : daysSince(lastBackupExportAt, now);
  if (lastBackupExportAt !== null && overdueDays! <= reminderDays) return base;
  // "关闭本次提醒"后，下个提醒周期到达后才再次提醒
  if (dismissedAt !== null && daysSince(dismissedAt, now) < reminderDays) return base;
  return { remind: true, overdueDays, neverExported };
}

/**
 * 备份文件名（08 §3.1 [TBD-7]）：产品名 + 日期；同一日多次导出追加序号（-1、-2）避免相互覆盖。
 * 浏览器无法读取下载目录感知历史文件，序号仅在本次会话内递增；跨会话重复日期由浏览器
 * 自身的重名处理兜底（多数浏览器自动加 (1) 后缀、不覆盖旧文件）。
 */
export function makeBackupFilename(dateStr: string, sameDaySeq: number): string {
  const base = `校园理财管家-备份-${dateStr}`;
  return sameDaySeq > 0 ? `${base}-${sameDaySeq}.json` : `${base}.json`;
}
