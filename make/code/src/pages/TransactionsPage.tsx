import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import WarningBanner from '@/components/WarningBanner';
import BudgetBar from '@/components/BudgetBar';
import CategoryPieChart, { PieEmpty } from '@/components/CategoryPieChart';
import TransactionFormModal from '@/components/TransactionFormModal';
import BudgetEditorModal from '@/components/BudgetEditorModal';
import CustomCycleModal from '@/components/CustomCycleModal';
import ImportWizardModal from '@/components/ImportWizardModal';
import { useTransactionsStore } from '@/stores/useTransactionsStore';
import { useCategoriesStore } from '@/stores/useCategoriesStore';
import { useBudgetsStore } from '@/stores/useBudgetsStore';
import { useAppStore } from '@/stores/useAppStore';
import { useAssetsStore } from '@/stores/useAssetsStore';
import {
  budgetProgress,
  buildWarnings,
  categoryBudgetMap,
  categorySlices,
  currentMonthKey,
  customCycleBounds,
  cycleStatus,
  monthBounds,
  periodStats,
  recordsInPeriod,
  type PeriodBounds,
} from '@/lib/stats';
import { formatYuan } from '@/lib/money';
import { today } from '@/lib/ids';
import type { CustomCycle, Transaction } from '@/lib/types';

/**
 * 收支与预算页（03 §1.1 界面构成）：
 * 周期切换器、周期统计总览、预算卡片区、收支分类占比图、收支记录列表、记一笔、超支预警提示条。
 */
export default function TransactionsPage() {
  const { transactions, load: loadTransactions, removeTransaction } = useTransactionsStore();
  const { categories, load: loadCategories } = useCategoriesStore();
  const { budgets, customCycles, load: loadBudgets, removeCustomCycle } = useBudgetsStore();
  const { settings, load: loadSettings, saveSettings } = useAppStore();
  const { accounts, load: loadAccounts } = useAssetsStore();

  const [monthKey, setMonthKey] = useState(currentMonthKey(new Date()));
  const [customId, setCustomId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Transaction | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [editCycle, setEditCycle] = useState<CustomCycle | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filterDirection, setFilterDirection] = useState<'all' | Transaction['direction']>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [pieDirection, setPieDirection] = useState<'expense' | 'income'>('expense');

  useEffect(() => {
    void loadTransactions();
    void loadCategories();
    void loadBudgets();
    void loadSettings();
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customCycle = customCycles.find((c) => c.id === customId) ?? null;
  const bounds: PeriodBounds = customCycle ? customCycleBounds(customCycle) : monthBounds(monthKey);
  const periodLabel = customCycle
    ? customCycle.name
    : monthKey === currentMonthKey(new Date())
      ? '本月'
      : `${Number(monthKey.split('-')[1])} 月`;
  const prevMonthKey =
    !customCycle && monthKey > '2026-01'
      ? dayjs(`${monthKey}-01`).subtract(1, 'month').format('YYYY-MM')
      : null;

  const periodRecords = useMemo(
    () => recordsInPeriod(transactions, bounds),
    [transactions, bounds],
  );
  const stats = useMemo(() => periodStats(periodRecords), [periodRecords]);

  const budget = budgets.find((b) => b.cycleType === (customCycle ? 'custom' : 'month') && b.cycleKey === (customCycle ? customCycle.id : monthKey));
  const catBudgets = categoryBudgetMap(budget);
  const thresholdPct = settings?.alertThresholdPct ?? 80;

  const expenseByL1 = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const totals = new Map<string, number>();
    for (const t of periodRecords) {
      if (t.direction !== 'expense' || !t.categoryId) continue;
      const cat = byId.get(t.categoryId);
      const l1 = cat ? (cat.level === 1 ? cat.id : (cat.parentId ?? cat.id)) : null;
      if (!l1) continue;
      totals.set(l1, (totals.get(l1) ?? 0) + t.amountCents);
    }
    return totals;
  }, [periodRecords, categories]);

  const totalSpent = stats.expenseCents;
  const totalView = budgetProgress(totalSpent, budget?.totalBudgetCents ?? 0, thresholdPct);
  const categoryViews = [...catBudgets.entries()].map(([categoryId, amountCents]) => ({
    categoryId,
    name: categories.find((c) => c.id === categoryId)?.name ?? '分类',
    view: budgetProgress(expenseByL1.get(categoryId) ?? 0, amountCents, thresholdPct),
  }));

  // 预警仅对进行中的周期生效（03 §5.2）；未开始/已结束不产生顶部提示
  const isActiveCycle = customCycle ? cycleStatus(customCycle, today()) === 'active' : true;
  const warnings = isActiveCycle
    ? buildWarnings(periodLabel, budget?.totalBudgetCents ? totalView : null, categoryViews)
    : [];

  // 当日已关闭的提示不再展示；梯度升级视为新提示（03 §5.6）
  const dismissed = settings?.dismissedWarnings ?? {};
  const visibleWarnings = warnings.filter((w) => dismissed[w.key] !== `${today()}|${w.level}`);

  const dismissWarning = (key: string, level: string) => {
    void saveSettings({ dismissedWarnings: { ...dismissed, [key]: `${today()}|${level}` } });
  };

  const slices = useMemo(
    () => categorySlices(periodRecords, categories, pieDirection),
    [periodRecords, categories, pieDirection],
  );

  const listRecords = useMemo(() => {
    return periodRecords
      .filter((t) => filterDirection === 'all' || t.direction === filterDirection)
      .filter((t) => {
        if (filterCategory === 'all') return true;
        const cat = categories.find((c) => c.id === t.categoryId);
        const l1 = cat ? (cat.level === 1 ? cat.id : cat.parentId) : null;
        return l1 === filterCategory || t.categoryId === filterCategory;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  }, [periodRecords, filterDirection, filterCategory, categories]);

  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? '已删除分类') : '—';

  const handleDelete = (record: Transaction) => {
    Modal.confirm({
      title: '删除这条记录？',
      content: '删除后无法恢复。相关统计与预算进度将立即重算。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await removeTransaction(record.id);
        message.success('已删除');
      },
    });
  };

  const monthOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];
    let key = currentMonthKey(new Date());
    for (let i = 0; i < 12; i++) {
      options.push({ label: key, value: key });
      key = dayjs(`${key}-01`).subtract(1, 'month').format('YYYY-MM');
    }
    return options;
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <WarningBanner warnings={visibleWarnings} onDismiss={dismissWarning} />

      {/* 周期切换器（03 §4.2） */}
      <Card size="small">
        <Space wrap>
          <Segmented
            value={customCycle ? `custom:${customCycle.id}` : 'month'}
            onChange={(v) => {
              if (v === 'month') setCustomId(null);
              else setCustomId(String(v).replace('custom:', ''));
            }}
            options={[
              { label: '月度', value: 'month' },
              ...customCycles.map((c) => ({ label: c.name, value: `custom:${c.id}` })),
            ]}
          />
          {!customCycle && (
            <DatePicker
              picker="month"
              allowClear={false}
              value={dayjs(`${monthKey}-01`)}
              onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            />
          )}
          <Button size="small" onClick={() => { setEditCycle(null); setCycleModalOpen(true); }}>
            新建周期
          </Button>
          {customCycle && (
            <Space>
              <a onClick={() => { setEditCycle(customCycle); setCycleModalOpen(true); }}>编辑周期</a>
              <a
                style={{ color: '#ff4d4f' }}
                onClick={() =>
                  Modal.confirm({
                    title: `删除周期「${customCycle.name}」？`,
                    content: '将删除该周期及其预算设置；收支记录全部保留、不受影响。',
                    okText: '删除',
                    okButtonProps: { danger: true },
                    cancelText: '取消',
                    onOk: async () => {
                      await removeCustomCycle(customCycle.id);
                      setCustomId(null);
                    },
                  })
                }
              >
                删除周期
              </a>
            </Space>
          )}
          <Select
            size="small"
            style={{ width: 120 }}
            value={monthKey}
            options={monthOptions}
            onChange={(v) => {
              setMonthKey(v);
              setCustomId(null);
            }}
          />
        </Space>
      </Card>

      {/* 周期统计总览（03 §2.3） */}
      <Card size="small">
        <Space size="large">
          <span>收入合计 <b>{formatYuan(stats.incomeCents)}</b></span>
          <span>支出合计 <b>{formatYuan(stats.expenseCents)}</b></span>
          <span>结余 <b>{formatYuan(stats.balanceCents)}</b></span>
        </Space>
      </Card>

      {/* 预算卡片区（03 §4.1、§6.2） */}
      <Card
        title="预算"
        extra={
          <Button size="small" onClick={() => setBudgetOpen(true)}>
            {budget ? '修改预算' : '设置预算'}
          </Button>
        }
      >
        {!budget && (
          <Empty description="本周期未设置预算" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
        )}
        <Space direction="vertical" style={{ width: '100%' }}>
          <BudgetBar title={`${periodLabel}总预算`} view={totalView} spentWithoutBudgetCents={totalSpent} onSetBudget={() => setBudgetOpen(true)} />
          {categoryViews.map(({ categoryId, name, view }) => (
            <BudgetBar
              key={categoryId}
              title={`「${name}」预算`}
              view={view}
              onSetBudget={() => setBudgetOpen(true)}
            />
          ))}
          {budget && categoryViews.length === 0 && (
            <Typography.Text type="secondary">未设置分类预算</Typography.Text>
          )}
        </Space>
      </Card>

      {/* 收支分类占比图（03 §6.1） */}
      <Card
        title="收支分类占比"
        extra={
          <Segmented
            value={pieDirection}
            onChange={(v) => setPieDirection(v as 'expense' | 'income')}
            options={[
              { label: '支出', value: 'expense' },
              { label: '收入', value: 'income' },
            ]}
          />
        }
      >
        {slices.length === 0 ? (
          <PieEmpty
            directionLabel={pieDirection === 'expense' ? '支出' : '收入'}
            onAdd={() => { setEditRecord(null); setFormOpen(true); }}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <CategoryPieChart slices={slices} />
        )}
      </Card>

      {/* 收支记录列表（03 §2.3） */}
      <Card
        title={`收支记录（${listRecords.length} 条）`}
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); setFormOpen(true); }}>
              记一笔
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              导入账单
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            size="small"
            style={{ width: 120 }}
            value={filterDirection}
            onChange={setFilterDirection}
            options={[
              { label: '全部方向', value: 'all' },
              { label: '支出', value: 'expense' },
              { label: '收入', value: 'income' },
              { label: '转账', value: 'transfer' },
            ]}
          />
          <Select
            size="small"
            style={{ width: 160 }}
            value={filterCategory}
            onChange={setFilterCategory}
            options={[
              { label: '全部分类', value: 'all' },
              ...categories
                .filter((c) => c.level === 1)
                .map((c) => ({ label: `${c.name}（${c.direction === 'expense' ? '支出' : '收入'}）`, value: c.id })),
            ]}
          />
        </Space>
        {listRecords.length === 0 ? (
          <Empty description="没有符合筛选条件的记录" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button onClick={() => { setFilterDirection('all'); setFilterCategory('all'); }}>清除筛选</Button>
          </Empty>
        ) : (
          <Table<Transaction>
            rowKey="id"
            size="small"
            dataSource={listRecords}
            pagination={{ pageSize: 10, size: 'small' }}
            columns={[
              { title: '日期', dataIndex: 'date', width: 110 },
              {
                title: '方向',
                dataIndex: 'direction',
                width: 70,
                render: (v: Transaction['direction']) =>
                  v === 'expense' ? <Tag color="red">支出</Tag> : v === 'income' ? <Tag color="green">收入</Tag> : <Tag>转账</Tag>,
              },
              {
                title: '分类',
                width: 110,
                render: (_, r) => (r.direction === 'transfer' ? '—' : categoryName(r.categoryId)),
              },
              {
                title: '备注',
                dataIndex: 'memo',
                ellipsis: true,
                render: (v: string | undefined) => v ?? '—',
              },
              {
                title: '金额',
                dataIndex: 'amountCents',
                width: 110,
                align: 'right',
                render: (v: number, r) => (
                  <span style={{ color: r.direction === 'expense' ? '#cf1322' : r.direction === 'income' ? '#2f7d5d' : undefined }}>
                    {r.direction === 'expense' ? '-' : r.direction === 'income' ? '+' : ''}
                    {formatYuan(v)}
                  </span>
                ),
              },
              {
                title: '账户',
                width: 120,
                render: (_, r) => {
                  const account = accounts.find((a) => a.id === r.accountId);
                  if (r.direction === 'transfer') {
                    const from = accounts.find((a) => a.id === r.accountId)?.name ?? '—';
                    const to = accounts.find((a) => a.id === r.counterAccountId)?.name ?? '—';
                    return `${from} → ${to}`;
                  }
                  return account ? account.name : '—';
                },
              },
              {
                title: '来源',
                dataIndex: 'source',
                width: 110,
                render: (v: Transaction['source']) =>
                  ({ manual: '手动录入', alipay_csv: '支付宝导入', wechat_csv: '微信导入', bank_statement: '银行流水导入' })[v],
              },
              {
                title: '操作',
                width: 100,
                render: (_, record) => (
                  <>
                    <a onClick={() => { setEditRecord(record); setFormOpen(true); }}>编辑</a>
                    <a style={{ marginLeft: 12, color: '#ff4d4f' }} onClick={() => handleDelete(record)}>
                      删除
                    </a>
                  </>
                ),
              },
            ]}
          />
        )}
      </Card>

      <TransactionFormModal
        open={formOpen}
        editRecord={editRecord}
        onCancel={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
      <BudgetEditorModal
        open={budgetOpen}
        cycleType={customCycle ? 'custom' : 'month'}
        cycleKey={customCycle ? customCycle.id : monthKey}
        prevMonthKey={prevMonthKey}
        onClose={() => setBudgetOpen(false)}
      />
      <CustomCycleModal
        open={cycleModalOpen}
        editCycle={editCycle}
        onClose={() => setCycleModalOpen(false)}
        onSaved={() => setCycleModalOpen(false)}
      />
      <ImportWizardModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void loadTransactions()}
      />
    </Space>
  );
}
