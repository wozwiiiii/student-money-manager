import { Card, Progress, Space, Typography } from 'antd';
import { formatYuan } from '@/lib/money';
import type { BudgetProgressView } from '@/lib/stats';

/**
 * 预算进度条卡片（03 §6.2、§5.5）：
 * 颜色梯度与预警一致（正常 / 接近超支 / 已超支）；超支后进度条封顶满格、文字标注超支金额。
 */
const LEVEL_COLOR: Record<BudgetProgressView['level'], string> = {
  normal: '#2f7d5d',
  warning: '#faad14',
  overspend: '#ff4d4f',
};

interface BudgetBarProps {
  title: string;
  view: BudgetProgressView;
  /** 无预算时展示的已支出金额与设置入口 */
  spentWithoutBudgetCents?: number;
  onSetBudget?: () => void;
}

export default function BudgetBar({ title, view, spentWithoutBudgetCents, onSetBudget }: BudgetBarProps) {
  const hasBudget = view.budgetCents > 0;
  return (
    <Card size="small" title={title}>
      {!hasBudget ? (
        <Space>
          <Typography.Text type="secondary">
            未设置预算{spentWithoutBudgetCents != null ? `，已支出 ${formatYuan(spentWithoutBudgetCents)}` : ''}
          </Typography.Text>
          {onSetBudget && <a onClick={onSetBudget}>设置预算</a>}
        </Space>
      ) : (
        <>
          <Progress
            percent={Math.min(view.percent, 100)}
            strokeColor={LEVEL_COLOR[view.level]}
            status="active"
          />
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary">
              已支出 {formatYuan(view.spentCents)} ｜ 预算 {formatYuan(view.budgetCents)}
            </Typography.Text>
            {view.level === 'overspend' ? (
              <Typography.Text style={{ color: LEVEL_COLOR.overspend }}>
                已超支 {formatYuan(view.overspendCents)}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">剩余可用 {formatYuan(view.remainingCents)}</Typography.Text>
            )}
          </Space>
        </>
      )}
    </Card>
  );
}
