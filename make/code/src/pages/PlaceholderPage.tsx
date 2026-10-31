import { Card, Empty, Typography } from 'antd';

interface PlaceholderPageProps {
  title: string;
  /** 空态引导文案（01 场景 6：全部跳过时显示引导用户开始的占位提示） */
  emptyDescription: string;
  /** 当前阶段状态说明 */
  stageNote: string;
}

/** 阶段 2 页面骨架：空数据首次使用态占位，功能在后续阶段实现（AGENT.md §6） */
export default function PlaceholderPage({ title, emptyDescription, stageNote }: PlaceholderPageProps) {
  return (
    <Card title={title}>
      <Empty description={emptyDescription} style={{ margin: '48px 0' }} />
      <Typography.Paragraph type="secondary">{stageNote}</Typography.Paragraph>
    </Card>
  );
}
