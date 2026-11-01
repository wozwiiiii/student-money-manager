import { useEffect, useState } from 'react';
import { Alert, Button, Space, message } from 'antd';
import { computeLastWriteAt } from '@/db/backup';
import { downloadBackupFile } from '@/lib/backupDownload';
import {
  BACKUP_REMIND_NEVER,
  BACKUP_REMIND_OVERDUE,
  EXPORT_DONE_NOTICE,
} from '@/lib/compliance';
import { shouldRemindBackup, type BackupReminderDecision } from '@/lib/backupReminder';
import { nowIso } from '@/lib/ids';
import { useAppStore } from '@/stores/useAppStore';

/**
 * 定期备份提醒条（08 §3.3）：页面顶部非阻断提示条。
 * 触发：距最近导出超过提醒周期且期间有数据写入；"关闭本次提醒"仅消除当次提示条，
 * 下个提醒周期到达后再次提醒；导出成功后计时基准重置。
 */
export default function BackupReminderBanner() {
  const { settings, appMeta, dismissBackupReminder } = useAppStore();
  const [decision, setDecision] = useState<BackupReminderDecision | null>(null);

  useEffect(() => {
    if (!settings || !appMeta) return;
    let cancelled = false;
    void (async () => {
      const lastWriteAt = await computeLastWriteAt();
      if (cancelled) return;
      setDecision(
        shouldRemindBackup({
          enabled: settings.backupReminderEnabled,
          reminderDays: settings.backupReminderDays,
          lastBackupExportAt: appMeta.lastBackupExportAt,
          lastWriteAt,
          dismissedAt: appMeta.backupReminderDismissedAt ?? null,
          now: nowIso(),
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [settings, appMeta]);

  if (!decision?.remind) return null;

  return (
    <Alert
      type="warning"
      showIcon
      banner
      message={decision.neverExported ? BACKUP_REMIND_NEVER : BACKUP_REMIND_OVERDUE(decision.overdueDays!)}
      action={
        <Space>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              void downloadBackupFile().then(() => message.success(EXPORT_DONE_NOTICE));
            }}
          >
            立即导出
          </Button>
          <Button size="small" onClick={() => void dismissBackupReminder()}>
            关闭本次提醒
          </Button>
        </Space>
      }
    />
  );
}
