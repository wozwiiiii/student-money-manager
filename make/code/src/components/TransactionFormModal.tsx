import { useEffect, useMemo, useState } from 'react';
import { DatePicker, Form, Input, Modal, Segmented, Select, Space, Tag, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import AmountInput from './AmountInput';
import { useTransactionsStore } from '@/stores/useTransactionsStore';
import { useCategoriesStore } from '@/stores/useCategoriesStore';
import { useAssetsStore } from '@/stores/useAssetsStore';
import type { Transaction, TxDirection } from '@/lib/types';

/**
 * 记一笔 / 编辑记录表单（03 §2.1）。
 * - 方向：支出/收入/转账，默认支出；转账不展示分类，改展示转出/转入账户
 * - 近期使用分类置顶（03 §2.1 规则 3）：按分类最近一次被保存进记录的时刻倒序取前 6 个 [Assumption, TBD: 6]
 * - 日期默认当天，范围为往前 365 天 [Assumption, TBD: 365]，不支持未来日期
 */

const RECENT_LIMIT = 6; // [Assumption, TBD: 6]
const DATE_LOOKBACK_DAYS = 365; // [Assumption, TBD: 365]
const MEMO_MAX = 50; // [Assumption, TBD: 50 字]

interface TransactionFormModalProps {
  open: boolean;
  editRecord?: Transaction | null;
  onCancel: () => void;
  onSaved: () => void;
}

export default function TransactionFormModal({ open, editRecord, onCancel, onSaved }: TransactionFormModalProps) {
  const { transactions, addTransaction, updateTransaction } = useTransactionsStore();
  const { categories, load: loadCategories } = useCategoriesStore();
  const { accounts, load: loadAccounts } = useAssetsStore();
  const [direction, setDirection] = useState<TxDirection>('expense');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [counterAccountId, setCounterAccountId] = useState<string | null>(null);
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open) return;
    void loadCategories();
    void loadAccounts();
    setDirection(editRecord?.direction ?? 'expense');
    setAmountCents(editRecord?.amountCents ?? null);
    setCategoryId(editRecord?.categoryId ?? null);
    setDate(editRecord ? dayjs(editRecord.date) : dayjs());
    setAccountId(editRecord?.accountId ?? null);
    setCounterAccountId(editRecord?.counterAccountId ?? null);
    setMemo(editRecord?.memo ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRecord?.id]);

  const activeCategories = useMemo(() => categories.filter((c) => !c.disabled), [categories]);

  /** 近期使用分类（03 §2.1 规则 3）：按分类最近一次保存进记录的时刻倒序 */
  const recentCategoryIds = useMemo(() => {
    const lastUsed = new Map<string, string>();
    for (const t of transactions) {
      if (t.direction !== direction || !t.categoryId) continue;
      const prev = lastUsed.get(t.categoryId);
      if (!prev || t.updatedAt > prev) lastUsed.set(t.categoryId, t.updatedAt);
    }
    return [...lastUsed.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([id]) => id)
      .slice(0, RECENT_LIMIT);
  }, [transactions, direction]);

  const topLevel = useMemo(
    () =>
      activeCategories
        .filter((c) => c.level === 1 && c.direction === direction)
        .sort((a, b) => {
          const ra = recentCategoryIds.indexOf(a.id);
          const rb = recentCategoryIds.indexOf(b.id);
          if (ra !== rb) return (ra < 0 ? RECENT_LIMIT : ra) - (rb < 0 ? RECENT_LIMIT : rb);
          return a.sortOrder - b.sortOrder;
        }),
    [activeCategories, direction, recentCategoryIds],
  );

  const handleSave = async () => {
    if (amountCents === null || amountCents <= 0) {
      message.error('请输入大于 0 的金额，最多两位小数');
      return;
    }
    if (direction !== 'transfer' && !categoryId) {
      message.error('请选择分类');
      return;
    }
    if (direction === 'transfer' && accountId && counterAccountId && accountId === counterAccountId) {
      message.error('转出与转入账户不能相同');
      return;
    }
    const payload = {
      date: date.format('YYYY-MM-DD'),
      direction,
      amountCents,
      categoryId: direction === 'transfer' ? null : categoryId,
      accountId,
      counterAccountId: direction === 'transfer' ? counterAccountId : null,
      source: 'manual' as const,
      memo: memo.trim() || undefined,
    };
    if (editRecord) {
      await updateTransaction(editRecord.id, payload);
    } else {
      await addTransaction(payload);
    }
    message.success('已保存');
    onSaved();
  };

  const renderCategoryPicker = () => {
    if (direction === 'transfer') {
      return (
        <>
          <Form.Item label="转出账户">
            <Select
              allowClear
              value={accountId ?? undefined}
              onChange={(v) => setAccountId(v ?? null)}
              options={accounts.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
          <Form.Item label="转入账户">
            <Select
              allowClear
              value={counterAccountId ?? undefined}
              onChange={(v) => setCounterAccountId(v ?? null)}
              options={accounts.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
        </>
      );
    }
    // 03 §3.3 归类精度可选：点一级即记到一级（二级可跳过）；选中一级后可再点二级细化
    const selectedL1 = categoryId
      ? (activeCategories.find((c) => c.id === categoryId)?.parentId ??
        categoryId)
      : null;
    const children = selectedL1
      ? activeCategories.filter((c) => c.parentId === selectedL1)
      : [];
    return (
      <Form.Item label="分类" required>
        <Space wrap>
          {topLevel.map((c) => (
            <Tag.CheckableTag
              key={c.id}
              checked={selectedL1 === c.id}
              onChange={() => setCategoryId(c.id)}
            >
              {c.name}
            </Tag.CheckableTag>
          ))}
        </Space>
        {children.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">可再选二级：</Typography.Text>
            <Space wrap>
              <Tag.CheckableTag checked={categoryId === selectedL1} onChange={() => setCategoryId(selectedL1)}>
                不细分
              </Tag.CheckableTag>
              {children.map((c) => (
                <Tag.CheckableTag key={c.id} checked={categoryId === c.id} onChange={() => setCategoryId(c.id)}>
                  {c.name}
                </Tag.CheckableTag>
              ))}
            </Space>
          </div>
        )}
        {!categoryId && (
          <Typography.Text type="danger" style={{ display: 'block', marginTop: 4 }}>
            请选择分类
          </Typography.Text>
        )}
      </Form.Item>
    );
  };

  return (
    <Modal
      title={editRecord ? '编辑记录' : '记一笔'}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label="方向">
          <Segmented
            value={direction}
            onChange={(v) => {
              setDirection(v as TxDirection);
              setCategoryId(null);
            }}
            options={[
              { label: '支出', value: 'expense' },
              { label: '收入', value: 'income' },
              { label: '转账', value: 'transfer' },
            ]}
          />
        </Form.Item>
        <Form.Item label="金额" required>
          <AmountInput value={amountCents} onChange={setAmountCents} placeholder="¥ 0.00" invalid={amountCents === null} />
          {amountCents !== null && amountCents <= 0 && (
            <Typography.Text type="danger">请输入大于 0 的金额，最多两位小数</Typography.Text>
          )}
        </Form.Item>
        {renderCategoryPicker()}
        <Form.Item label="日期" required>
          <DatePicker
            style={{ width: '100%' }}
            value={date}
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs().subtract(DATE_LOOKBACK_DAYS, 'day'), 'day')}
            onChange={(d) => d && setDate(d)}
          />
        </Form.Item>
        {direction !== 'transfer' && accounts.length > 0 && (
          <Form.Item label="所属账户">
            <Select
              allowClear
              value={accountId ?? undefined}
              onChange={(v) => setAccountId(v ?? null)}
              options={accounts.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
        )}
        <Form.Item label={`备注（可选，最多 ${MEMO_MAX} 字）`}>
          <Input.TextArea
            rows={2}
            maxLength={MEMO_MAX}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="请勿填写密码、证件号等敏感信息"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
