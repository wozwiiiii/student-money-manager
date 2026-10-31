import PlaceholderPage from './PlaceholderPage';

/** 预算（03 号文档）：月度 + 自定义周期双维度预算、超支预警在阶段 4 实现 */
export default function BudgetPage() {
  return (
    <PlaceholderPage
      title="预算"
      emptyDescription="还没有设置预算：设置本月总预算与分类预算，跟踪每一笔花费"
      stageNote="月度与自定义周期（如学期）双维度预算、进度条与超支预警将在阶段 4 实现（对应 spec 03 号文档）。"
    />
  );
}
