import { useRef, useState } from 'react';
import { Button, InputNumber, Modal, Space, Switch, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  clearAllData,
  hasLocalUserData,
  importBackup,
  validateBackupFile,
  type BackupFile,
} from '@/db/backup';
import { downloadBackupFile } from '@/lib/backupDownload';
import { scheduleSync } from '@/lib/syncScheduler';
import { useSyncStore } from '@/stores/useSyncStore';
import {
  CLEAR_SCOPE_TEXT,
  EXPORT_DONE_NOTICE,
  IMPORT_CONFLICT_TEXT,
  IMPORT_INVALID_TEXT,
  SAVE_FAILURE_SUGGESTIONS,
  SAVE_FAILURE_TEXT,
} from '@/lib/compliance';
import { reloadAllStores } from '@/stores/reloadAll';
import { useAppStore } from '@/stores/useAppStore';

/**
 * 数据管理区（08 §2.5、§3）：导出备份、导入恢复、清空全部数据、定期备份提醒设置。
 * - 导入冲突"询问后覆盖，不合并"（08 §3.2）；覆盖前提供"先导出当前数据"快捷路径
 * - 清空提供"先导出备份再清空"快捷路径（08 §2.5 步骤 2，引导而非强制 [TBD-6]）
 * - 全部破坏性操作二次确认（AGENT.md §4.4）
 */
export default function DataManagementPanel() {
  const navigate = useNavigate();
  const { settings, appMeta, saveSettings } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{
    file: BackupFile;
    localHasData: boolean;
  } | null>(null);

  const handleExport = async () => {
    try {
      await downloadBackupFile();
      message.success({ content: EXPORT_DONE_NOTICE, duration: 6 });
    } catch {
      message.error(`${SAVE_FAILURE_TEXT}。处理建议：${SAVE_FAILURE_SUGGESTIONS.join('；')}`);
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      message.error(IMPORT_INVALID_TEXT);
      return;
    }
    const validated = validateBackupFile(raw);
    if (!validated.ok) {
      message.error(validated.error);
      return;
    }
    // 预览确认（08 §3.2 步骤 2）+ 冲突判定（步骤 3）
    setPendingFile({ file: validated.file, localHasData: await hasLocalUserData() });
  };

  const executeImport = async () => {
    if (!pendingFile) return;
    const result = await importBackup(pendingFile.file);
    if (!result.ok) {
      message.error(result.error);
      return;
    }
    setPendingFile(null);
    await reloadAllStores();
    // 备份导入视作一次本地整体写入，登录状态下推送至云端（08 §9.2）
    scheduleSync();
    message.success(
      `恢复完成：账户 ${result.counts.accounts} 个、收支记录 ${result.counts.transactions} 条、资产快照 ${result.counts.snapshots} 条、储蓄目标 ${result.counts.goals} 个`,
    );
  };

  const handleClear = () => {
    // 首次确认（08 §2.5 步骤 1）：明示范围 + 备份快捷路径
    Modal.confirm({
      title: '清空全部数据？',
      content: (
        <div>
          <p>{CLEAR_SCOPE_TEXT}。</p>
          {useSyncStore.getState().token && <p>登录模式下：云端数据副本将一并删除（账号保留）。</p>}
          <p>
            <Button size="small" onClick={() => void handleExport()}>
              先导出备份再清空
            </Button>
          </p>
        </div>
      ),
      okText: '继续',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        // 再次确认后执行（08 §2.5 步骤 3）
        Modal.confirm({
          title: '确认删除全部数据？',
          content: '再次确认：此操作无法恢复。若还没导出备份，建议先取消并导出。',
          okText: '删除全部数据',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            // 登录模式下云端数据副本一并删除（08 §2.5）；账号保留
            if (useSyncStore.getState().token) {
              try {
                await useSyncStore.getState().wipeCloud();
              } catch {
                message.warning('云端副本删除未完成，将在下次同步时重试');
              }
            }
            await clearAllData();
            await reloadAllStores();
            message.success('已清空全部数据，应用已回到首次使用状态');
          },
        });
      },
    });
  };

  const pending = pendingFile?.file;
  const counts = pending?.data;

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>导出备份文件</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              一次性导出全部数据（账户、快照、收支记录、分类、预算、储蓄目标、测评结果、设置与状态）。
              全程本地完成，不经网络。
            </Typography.Text>
          </div>
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={() => void handleExport()}>
              导出备份文件
            </Button>
            <Typography.Text type="secondary">
              {appMeta?.lastBackupExportAt
                ? `最近导出：${dayjs(appMeta.lastBackupExportAt).format('YYYY-MM-DD HH:mm')}`
                : '尚未导出过备份'}
            </Typography.Text>
          </Space>
        </div>

        <div>
          <Typography.Text strong>导入备份文件</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              从此前导出的备份文件恢复数据。仅接受本应用导出的备份文件；
              本地已有数据时为整体覆盖、不合并（覆盖前可先导出当前数据）。
            </Typography.Text>
          </div>
          <Button style={{ marginTop: 8 }} onClick={() => fileInputRef.current?.click()}>
            导入备份文件
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => void handleFileChosen(e)}
          />
        </div>

        <div>
          <Typography.Text strong>定期备份提醒</Typography.Text>
          <Space style={{ display: 'flex', marginTop: 4 }}>
            <Switch
              checked={settings?.backupReminderEnabled ?? true}
              onChange={(checked) => {
                void saveSettings({ backupReminderEnabled: checked });
                message.success('已保存，即时生效');
              }}
            />
            <Typography.Text type="secondary">超过</Typography.Text>
            <InputNumber
              value={settings?.backupReminderDays ?? 30}
              min={1}
              precision={0}
              addonAfter="天"
              style={{ width: 110 }}
              disabled={!settings?.backupReminderEnabled}
              onChange={(v) => {
                if (v != null && v >= 1) void saveSettings({ backupReminderDays: v });
              }}
            />
            <Typography.Text type="secondary">未备份时，在页面顶部提醒</Typography.Text>
          </Space>
          <div>
            <Typography.Text type="secondary">
              仅在期间有新数据产生时提醒（08 §3.3，默认开启、周期 30 天 [TBD-9]）。
            </Typography.Text>
          </div>
        </div>

        <div>
          <Typography.Text strong>清空全部数据</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              将应用恢复到首次使用状态。删除后无法恢复，请先导出备份（08 §2.5）。
            </Typography.Text>
          </div>
          <Button danger style={{ marginTop: 8 }} onClick={handleClear}>
            清空全部数据
          </Button>
        </div>

        <div>
          <Button onClick={() => navigate('/privacy')}>查看完整隐私说明</Button>
        </div>
      </Space>

      {/* 导入预览与冲突处理（08 §3.2） */}
      <Modal
        title="导入备份文件"
        open={!!pending}
        onCancel={() => setPendingFile(null)}
        footer={
          <Space>
            <Button onClick={() => setPendingFile(null)}>取消</Button>
            {pendingFile?.localHasData && (
              <Button
                onClick={() => {
                  void handleExport();
                }}
              >
                先导出当前数据再覆盖
              </Button>
            )}
            <Button
              danger={!!pendingFile?.localHasData}
              type={pendingFile?.localHasData ? 'default' : 'primary'}
              onClick={() => void executeImport()}
            >
              {pendingFile?.localHasData ? '覆盖' : '恢复'}
            </Button>
          </Space>
        }
      >
        {pending && counts && (
          <div>
            <Typography.Paragraph>
              备份生成日期：{dayjs(pending.exportedAt).format('YYYY-MM-DD HH:mm')}
            </Typography.Paragraph>
            <Typography.Paragraph>
              概况：账户 {counts.accounts.length} 个、收支记录 {counts.transactions.length} 条、
              资产快照 {counts.snapshots.length} 条、储蓄目标 {counts.goals.length} 个
              （另有分类、预算、测评结果、设置与状态记录一并恢复）。
            </Typography.Paragraph>
            {pendingFile?.localHasData ? (
              <Typography.Text type="warning">{IMPORT_CONFLICT_TEXT}</Typography.Text>
            ) : (
              <Typography.Text type="secondary">
                本地暂无数据，将直接恢复备份内容。
              </Typography.Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
