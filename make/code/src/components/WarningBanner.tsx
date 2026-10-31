import { Alert, Space, Typography } from 'antd';
import type { WarningItem } from '@/lib/stats';

/**
 * 页面顶部超支预警提示条（03 §5.3～5.6）：
 * 最多展示 3 条，其余折叠为「+N」（[Assumption, TBD: 3]）；手动关闭当天内不再展示，梯度升级重新展示。
 */
interface WarningBannerProps {
  warnings: WarningItem[];
  /** 当日已关闭的 key 集合（含梯度判定后的过滤结果） */
  onDismiss: (key: string, level: WarningItem['level']) => void;
}

export default function WarningBanner({ warnings, onDismiss }: WarningBannerProps) {
  if (warnings.length === 0) return null;
  const shown = warnings.slice(0, 3);
  const rest = warnings.slice(3);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {shown.map((w) => (
        <Alert
          key={w.key}
          type={w.level === 'overspend' ? 'error' : 'warning'}
          showIcon
          closable
          message={w.message}
          onClose={() => onDismiss(w.key, w.level)}
        />
      ))}
      {rest.length > 0 && (
        <Typography.Text type="secondary">
          还有 {rest.length} 条预警：
          {rest.map((w) => w.message).join('；')}
        </Typography.Text>
      )}
    </Space>
  );
}
