import PlaceholderPage from './PlaceholderPage';

/** 收支记录（03 号文档）：记一笔、CSV 导入、记录列表在阶段 4 实现 */
export default function TransactionsPage() {
  return (
    <PlaceholderPage
      title="收支记录"
      emptyDescription="还没有收支记录：可以手动记一笔，或导入支付宝/微信账单 CSV"
      stageNote="记一笔、账单 CSV 导入与记录列表将在阶段 4 实现（对应 spec 03 号文档）。"
    />
  );
}
