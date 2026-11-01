import { useEffect, useState } from 'react';
import { DatePicker, Form, Input, Modal, Space, Tag, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import AmountInput from './AmountInput';
import { useGoalsStore } from '@/stores/useGoalsStore';
import {
  GOAL_NAME_MAX,
  GOAL_NOTE_MAX,
  validateGoalDate,
  validateGoalName,
  validateTargetCents,
} from '@/lib/goals';
import { today } from '@/lib/ids';
import type { SavingsGoal } from '@/lib/types';

/** 目标名称预置模板（04 §2.3）：点选填入输入框，也可自由输入 */
const NAME_TEMPLATES = ['换数码设备', '旅行', '应急备用金', '毕业过渡金'];

interface GoalFormModalProps {
  open: boolean;
  /** 编辑目标；为空表示新建 */
  editGoal?: SavingsGoal | null;
  onCancel: () => void;
  onSaved: () => void;
}

interface GoalFormErrors {
  name?: string;
  target?: string;
  date?: string;
}

/**
 * 目标创建 / 编辑弹窗（04 §2.3、§2.6、§2.7）。
 * 状态迁移（达成 / 重开）由 store 自动完成（04 §2.5），本组件只在「已达成 → 进行中」时提示用户。
 */
export default function GoalFormModal({ open, editGoal, onCancel, onSaved }: GoalFormModalProps) {
  const { addGoal, updateGoal } = useGoalsStore();
  const [name, setName] = useState('');
  const [targetCents, setTargetCents] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<Dayjs>(dayjs());
  const [initialCents, setInitialCents] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<GoalFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setName(editGoal?.name ?? '');
    setTargetCents(editGoal?.targetCents ?? null);
    setDeadline(editGoal ? dayjs(editGoal.deadline) : dayjs());
    setInitialCents(null);
    setNote(editGoal?.note ?? '');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editGoal?.id]);

  const handleSave = async () => {
    const dateStr = deadline.format('YYYY-MM-DD');
    // 逐字段校验（04 §2.7），错误文案取校验函数返回值
    const errName = validateGoalName(name);
    const errTarget = validateTargetCents(targetCents);
    const errDate = validateGoalDate(dateStr, today(), editGoal?.deadline);
    setErrors({
      name: errName ?? undefined,
      target: errTarget ?? undefined,
      date: errDate ?? undefined,
    });
    if (errName || errTarget || errDate || targetCents === null) return;

    if (editGoal) {
      const prevStatus = editGoal.status;
      await updateGoal(editGoal.id, {
        name: name.trim(),
        targetCents,
        deadline: dateStr,
        note: note.trim() || undefined,
      });
      // 目标金额上调可让已达成目标重开（04 §2.5/2.6），迁移由 store 自动完成，这里只做提示
      const after = useGoalsStore.getState().goals.find((g) => g.id === editGoal.id)?.status;
      if (prevStatus === 'achieved' && after === 'active') {
        message.info('目标金额已调整，目标重新开启');
      } else {
        message.success('已保存');
      }
    } else {
      // addGoal 无返回值：先记下已有 id，之后从刷新过的 store 状态中反查新建目标（04 §2.3 初始已储蓄）
      const prevIds = new Set(useGoalsStore.getState().goals.map((g) => g.id));
      await addGoal({
        name: name.trim(),
        targetCents,
        deadline: dateStr,
        linkedAccountIds: [],
        note: note.trim() || undefined,
      });
      // 初始已储蓄 > 0 时生成首条存入记录：方向存入、日期为创建当天、备注「初始金额」（04 §2.3）
      if (initialCents != null && initialCents > 0) {
        const created = useGoalsStore
          .getState()
          .goals.filter((g) => !prevIds.has(g.id))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (created) {
          await useGoalsStore.getState().addEntry({
            goalId: created.id,
            type: 'deposit',
            amountCents: initialCents,
            date: today(),
            memo: '初始金额',
          });
        }
      }
      message.success('已保存');
    }
    onSaved();
  };

  return (
    <Modal
      title={editGoal ? '编辑目标' : '新建目标'}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label="目标名称" required>
          <Input
            value={name}
            maxLength={GOAL_NAME_MAX}
            placeholder="如：换台笔记本"
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
          <Space wrap style={{ marginTop: 8 }}>
            {NAME_TEMPLATES.map((t) => (
              <Tag.CheckableTag
                key={t}
                checked={name === t}
                onChange={() => {
                  setName(t);
                  setErrors((p) => ({ ...p, name: undefined }));
                }}
              >
                {t}
              </Tag.CheckableTag>
            ))}
          </Space>
          {errors.name && (
            <Typography.Text type="danger" style={{ display: 'block', marginTop: 4 }}>
              {errors.name}
            </Typography.Text>
          )}
        </Form.Item>
        <Form.Item label="目标金额" required>
          <AmountInput
            value={targetCents}
            onChange={(v) => {
              setTargetCents(v);
              setErrors((p) => ({ ...p, target: undefined }));
            }}
            placeholder="¥ 0.00"
            invalid={errors.target !== undefined}
          />
          {errors.target && <Typography.Text type="danger">{errors.target}</Typography.Text>}
        </Form.Item>
        <Form.Item label="目标日期" required>
          <DatePicker
            style={{ width: '100%' }}
            value={deadline}
            allowClear={false}
            // 创建时禁选今天之前；编辑逾期目标须保留原过去日期可选（04 §2.7）
            disabledDate={(d) =>
              d.isBefore(dayjs(), 'day') && d.format('YYYY-MM-DD') !== (editGoal?.deadline ?? '')
            }
            onChange={(d) => {
              if (d) {
                setDeadline(d);
                setErrors((p) => ({ ...p, date: undefined }));
              }
            }}
          />
          {errors.date && <Typography.Text type="danger">{errors.date}</Typography.Text>}
        </Form.Item>
        {!editGoal && (
          <Form.Item label="初始已储蓄（可选，≥ 0）">
            <AmountInput value={initialCents} onChange={setInitialCents} placeholder="¥ 0.00" />
            <Typography.Text type="secondary">
              用于创建前已攒了一部分钱的场景；填写后将自动生成首条存入记录（备注「初始金额」）
            </Typography.Text>
          </Form.Item>
        )}
        <Form.Item label={`备注（可选，最多 ${GOAL_NOTE_MAX} 字）`}>
          <Input.TextArea
            rows={2}
            maxLength={GOAL_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="请勿填写密码、证件号等敏感信息"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
