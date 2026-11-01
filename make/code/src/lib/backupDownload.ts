import { exportBackup } from '@/db/backup';
import { makeBackupFilename } from '@/lib/backupReminder';
import { today } from '@/lib/ids';
import { useAppStore } from '@/stores/useAppStore';

/**
 * 导出备份文件并触发浏览器下载（08 §3.1）。
 * 全程本地完成，不经过任何网络传输（08 §4.1）。
 * 同日序号仅在本次会话内递增（浏览器无法读取下载目录感知历史文件，08 §3.1 [TBD-7]）。
 */
const seqByDate = new Map<string, number>();

export async function downloadBackupFile(): Promise<void> {
  const file = await exportBackup();
  const dateStr = today().replace(/-/g, '');
  const seq = seqByDate.get(dateStr) ?? 0;
  seqByDate.set(dateStr, seq + 1);

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = makeBackupFilename(dateStr, seq);
  a.click();
  URL.revokeObjectURL(url);

  // 记录"最近一次备份导出时间"（08 §3.3 提醒的计时基准）
  await useAppStore.getState().markBackupExported();
}
