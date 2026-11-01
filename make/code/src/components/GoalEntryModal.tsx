import { useEffect, useState } from 'react';
import { DatePicker, Form, Input, Modal, Segmented, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import AmountInput from './AmountInput';
import { useGoalsStore } from '@/stores/useGoalsStore';
import { ENTRY_MEMO_MAX, savedCentsOf, validateEntryAmount, validateWithdraw } from '@/lib/goals';
import type { GoalEntry, SavingsGoal } from '@/lib/types';

type EntryType = GoalEntry['type'];

interface GoalEntryModalProps {
  open: boolean;
  goal: SavingsGoal | null;
  /** 编辑记录；为空表示新增 */
  editEntry?: GoalEntry | null;
  /** 新增时的默认方向 */
  defaultType?: EntryType;
  onCancel: () => void;
  onSaved: () => void;
}

interface EntryFormErrors {
  amount?: string;
  withdraw?: string;
}

/**
 * 存入 / 取出记录弹窗（04 §2.4）：新增与编辑共用。
 * 取出校验要排除「本条记录被编辑前」的贡献（04 §2.7），避免编辑场景下误判为超额取出。
 */
export default function GoalEntryModal({
  open,
  goal,
  editEntry,
  defaultType = 'deposit',
  onCancel,
  onSaved,
}: GoalEntryModalProps) {
  const { entries, addEntry, updateEntry } = useGoalsStore();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [entryType, setEntryType] = useState<EntryType>('deposit');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<EntryFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setDate(editEntry ? dayjs(editEntry.date) : dayjs());
    setEntryType(editEntry?.type ?? defaultType);
    setAmountCents(editEntry?.amountCents ?? null);
    setMemo(editEntry?.memo ?? '');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEntry?.id]);

  const handleSave = async () => {
    if (!goal) return;
    const errAmount = validateEntryAmount(amountCents);
    let errWithdraw: string | null = null;
    if (!errAmount && entryType === 'withdraw' && amountCents !== null) {
      // 编辑时先把原记录的贡献（存入记 +、取出记 −）从已储蓄中剔除，再校验新取出金额
      const originalSigned = editEntry
        ? editEntry.type === 'deposit'
          ? editEntry.amountCents
          : -editEntry.amountCents
        : 0;
      errWithdraw = validateWithdraw(savedCentsOf(goal.id, entries) - originalSigned, amountCents);
    }
    setErrors({ amount: errAmount ?? undefined, withdraw: errWithdraw ?? undefined });
    if (errAmount || errWithdraw || amountCents === null) return;

    const payload = {
      goalId: goal.id,
      type: entryType,
      amountCents,
      date: date.format('YYYY-MM-DD'),
      memo: memo.trim() || undefined,
    };
    if (editEntry) await updateEntry(editEntry.id, payload);
    else await addEntry(payload);
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal
      title={editEntry ? '编辑记录' : '添加存入 / 取出'}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label="方向" required>
          <Segmented
            value={entryType}
            onChange={(v) => {
              setEntryType(v as EntryType);
              setErrors({});
            }}
            options={[
              { label: '存入', value: 'deposit' },
              { label: '取出', value: 'withdraw' },
            ]}
          />
        </Form.Item>
        <Form.Item label="日期" required>
          <DatePicker
            style={{ width: '100%' }}
            value={date}
            allowClear={false}
            onChange={(d) => d && setDate(d)}
          />
        </Form.Item>
        <Form.Item label="金额" required>
          <AmountInput
            value={amountCents}
            onChange={(v) => {
              setAmountCents(v);
              setErrors({});
            }}
            placeholder="¥ 0.00"
            invalid={errors.amount !== undefined}
          />
          {errors.amount && <Typography.Text type="danger">{errors.amount}</Typography.Text>}
          {errors.withdraw && <Typography.Text type="danger">{errors.withdraw}</Typography.Text>}
        </Form.Item>
        <Form.Item label={`备注（可选，最多 ${ENTRY_MEMO_MAX} 字）`}>
          <Input.TextArea
            rows={2}
            maxLength={ENTRY_MEMO_MAX}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="请勿填写密码、证件号等敏感信息"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
