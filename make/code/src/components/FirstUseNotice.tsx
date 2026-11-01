import { useState } from 'react';
import { Button, Drawer, Space, Typography } from 'antd';
import PrivacyContent from '@/components/PrivacyContent';
import { FIRST_NOTICE_CONFIRM, FIRST_NOTICE_ITEMS, GLOBAL_DISCLAIMER_FULL } from '@/lib/compliance';
import { useAppStore } from '@/stores/useAppStore';

/**
 * 首次使用告知层（08 §7）：本地不存在告知确认状态时展示，确认后记录一次、不再弹出。
 * - "查看完整隐私说明"打开抽屉不等于确认（08 §7）：展开说明后告知层保持，确认只能通过按钮发生；
 * - 清空全部数据后确认状态随之清除，告知层重现；从备份恢复不重现（确认状态随备份恢复）。
 * 展示层为阻断式遮罩：告知发生在使用开始之前（08 §7"在进入初始化引导之前展示告知层"）。
 */
export default function FirstUseNotice() {
  const { appMeta, ackFirstUseNotice } = useAppStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 未加载完成或已确认过则不展示（08 §7：确认状态记录一次，此后不再弹出）
  if (appMeta == null || appMeta.firstUseNoticeAckAt != null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 560,
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 24,
        }}
      >
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          使用前须知
        </Typography.Title>
        <ol style={{ paddingLeft: 20 }}>
          {FIRST_NOTICE_ITEMS.map((item) => (
            <li key={item}>
              <Typography.Paragraph style={{ marginBottom: 8 }}>{item}</Typography.Paragraph>
            </li>
          ))}
        </ol>
        {/* 全局声明要点（08 §6.1 浅白要点版）：市场风险提示与不提供投资顾问 */}
        <Typography.Paragraph type="secondary">{GLOBAL_DISCLAIMER_FULL[3]}</Typography.Paragraph>
        <Typography.Paragraph type="secondary">{GLOBAL_DISCLAIMER_FULL[4]}</Typography.Paragraph>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* 查看完整说明 ≠ 确认（08 §7）：抽屉内阅读不消除告知层 */}
          <Button block onClick={() => setDrawerOpen(true)}>
            查看完整隐私说明
          </Button>
          <Button block type="primary" onClick={() => void ackFirstUseNotice()}>
            {FIRST_NOTICE_CONFIRM}
          </Button>
        </Space>
      </div>

      <Drawer
        title="完整隐私说明"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        <PrivacyContent />
      </Drawer>
    </div>
  );
}
