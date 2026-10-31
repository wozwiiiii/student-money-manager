import PlaceholderPage from './PlaceholderPage';

/** 自定义设置与数据管理（05、08 号文档）：设置项、备份导出/导入、隐私说明在阶段 5～6 实现 */
export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="设置"
      emptyDescription="分类、账户、预算规则的自定义与数据备份管理将在这里"
      stageNote="自定义设置在阶段 5 实现；数据管理（备份导出/恢复、清空数据）与隐私说明页在阶段 6 实现（对应 spec 05、08 号文档）。"
    />
  );
}
