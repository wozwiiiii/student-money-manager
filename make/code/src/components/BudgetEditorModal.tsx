import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Typography, message } from 'antd';
import AmountInput from './AmountInput';
import { useBudgetsStore } from '@/stores/useBudgetsStore';
import { useCategoriesStore } from '@/stores/useCategoriesStore';
import type { Budget } from '@/lib/types';

/**
 * 预算编辑（03 §4.1）：总预算 + 分类预算（一级分类）；「复制上月预算」仅月度视图可用。
 * 分类预算合计超过总预算时提示但不阻止（03 §4.1 规则 4）。
 */
interface BudgetEditorModalProps {
  open: boolean;
  cycleType: 'month' | 'custom';
  cycleKey: string;
  /** 月度视图的上月 key，用于「复制上月预算」；自定义周期传 null */
  prevMonthKey: string | null;
  onClose: () => void;
}

export default function BudgetEditorModal({
  open,
  cycleType,
  cycleKey,
  prevMonthKey,
  onClose,
}: BudgetEditorModalProps) {
  const { budgets, saveBudget, load: loadBudgets } = useBudgetsStore();
  const { categories, load: loadCategories } = useCategoriesStore();
  const [totalCents, setTotalCents] = useState<number | null>(null);
  const [catAmounts, setCatAmounts] = useState<Record<string, number | null>>({});

  const budget: Budget | undefined = budgets.find(
    (b) => b.cycleType === cycleType && b.cycleKey === cycleKey,
  );
  const expenseL1 = categories.filter((c) => c.level === 1 && c.direction === 'expense');

  useEffect(() => {
    if (!open) return;
    void loadBudgets();
    void loadCategories();
    setTotalCents(budget?.totalBudgetCents ?? null);
    setCatAmounts(Object.fromEntries((budget?.categoryBudgets ?? []).map((c) => [c.categoryId, c.amountCents])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycleKey, cycleType]);

  const prevBudget =
    prevMonthKey !== null
      ? budgets.find((b) => b.cycleType === 'month' && b.cycleKey === prevMonthKey)
      : undefined;

  const copyPrevMonth = () => {
    if (!prevBudget) return;
    setTotalCents(prevBudget.totalBudgetCents ?? null);
    setCatAmounts(
      Object.fromEntries(
        // 上月已设置、当前已停用的分类被跳过（03 §4.1 规则 3）
        prevBudget.categoryBudgets
          .filter((c) => expenseL1.some((x) => x.id === c.categoryId))
          .map((c) => [c.categoryId, c.amountCents]),
      ),
    );
    message.info('已复制上月预算，请核对后保存');
  };

  const handleSave = async () => {
    if (totalCents === null && Object.values(catAmounts).every((v) => v === null || v === undefined)) {
      message.warning('请至少设置总预算或一个分类预算');
      return;
    }
    const categoryBudgets = expenseL1
      .filter((c) => catAmounts[c.id] != null && (catAmounts[c.id] ?? 0) > 0)
      .map((c) => ({ categoryId: c.id, amountCents: catAmounts[c.id] as number }));
    const total = totalCents != null && totalCents > 0 ? totalCents : null;
    const sum = categoryBudgets.reduce((acc, c) => acc + c.amountCents, 0);
    if (total !== null && sum > total) {
      message.warning('分类预算合计已超过总预算');
    }
    await saveBudget({
      cycleType,
      cycleKey,
      totalBudgetCents: total,
      categoryBudgets,
    });
    message.success('预算已保存');
    onClose();
  };

  return (
    <Modal
      title={cycleType === 'month' ? '设置本月预算' : '设置本周期预算'}
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      {prevMonthKey !== null && (
        <Button style={{ marginBottom: 12 }} disabled={!prevBudget} onClick={copyPrevMonth}>
          复制上月预算{!prevBudget ? '（上月无预算可复制）' : ''}
        </Button>
      )}
      <Form layout="vertical">
        <Form.Item label="总预算金额（该周期支出总额上限）">
          <AmountInput value={totalCents} onChange={setTotalCents} placeholder="可留空，仅设分类预算" />
        </Form.Item>
        <Typography.Text strong>分类预算（各一级分类支出上限，可只设部分）</Typography.Text>
        {expenseL1.map((c) => (
          <Form.Item key={c.id} label={c.name} style={{ marginBottom: 8 }}>
            <AmountInput
              value={catAmounts[c.id] ?? null}
              onChange={(v) => setCatAmounts((prev) => ({ ...prev, [c.id]: v }))}
              placeholder="未设置"
            />
          </Form.Item>
        ))}
      </Form>
      <Alert
        type="info"
        showIcon
        message="预算金额为大于 0 的数字；填 0 或留空视为未设置。分类预算合计与总预算允许不一致。"
      />
    </Modal>
  );
}
