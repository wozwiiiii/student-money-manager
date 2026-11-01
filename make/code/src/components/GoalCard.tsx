import { useState } from 'react';
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Modal,
  Progress,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { CaretDownOutlined, CaretUpOutlined, DownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import GoalEntryModal from './GoalEntryModal';
import { useGoalsStore } from '@/stores/useGoalsStore';
import {
  goalProgressPct,
  isOverdue,
  paceForecast,
  remainingDays,
  savedCentsOf,
  type PaceForecast,
} from '@/lib/goals';
import { formatYuan } from '@/lib/money';
import { today } from '@/lib/ids';
import type { GoalEntry, SavingsGoal } from '@/lib/types';

/** 日期展示为「M 月 D 日」（04 §2.4 完成预期提示的日期格式） */
function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

/** 完成预期提示文案（04 §2.4），金额四舍五入后格式化；已达成不显示该行 */
function paceText(forecast: PaceForecast): string | null {
  switch (forecast.kind) {
    case 'achieved':
      return null;
    case 'insufficient':
      return '记录更多存入后，可查看达成预期';
    case 'onTrack':
      return `按每周存入 ${formatYuan(Math.round(forecast.weeklyAvgCents))} 的节奏，预计可按期达成（约 ${formatMonthDay(forecast.etaDate)}）`;
    case 'late':
      return `按每周存入 ${formatYuan(Math.round(forecast.weeklyAvgCents))} 的节奏，预计 ${formatMonthDay(forecast.etaDate)} 达成，比目标日期晚 ${forecast.lateDays} 天；若想按期达成，每周需存约 ${formatYuan(Math.round(forecast.requiredWeeklyCents))}`;
  }
}

/** 状态标记（04 §2.2） */
function statusTag(status: SavingsGoal['status']) {
  if (status === 'achieved') return <Tag color="green">已达成</Tag>;
  if (status === 'abandoned') return <Tag>已放弃</Tag>;
  return <Tag color="blue">进行中</Tag>;
}

interface MenuAction {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick: () => void;
}

interface GoalCardProps {
  goal: SavingsGoal;
  /** 该目标的存入 / 取出记录 */
  entries: GoalEntry[];
  /** archived = 归档区只读展示（04 §2.6：仅查看、取消归档、删除） */
  mode?: 'normal' | 'archived';
  /** 打开编辑弹窗（04 §2.5 逾期「延期」也走编辑弹窗改目标日期） */
  onEditGoal: (goal: SavingsGoal) => void;
}

/**
 * 储蓄目标卡片（04 §2.2）：摘要 + 可展开详情区。
 * 点击摘要区展开/收起详情；逾期卡片整卡警示高亮并给出延期 / 放弃 / 继续跟进三选项（04 §2.5）。
 */
export default function GoalCard({ goal, entries, mode = 'normal', onEditGoal }: GoalCardProps) {
  const { removeGoal, setArchived, abandonGoal, reopenGoal, removeEntry } = useGoalsStore();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [entryModal, setEntryModal] = useState<{
    open: boolean;
    editEntry: GoalEntry | null;
    defaultType: GoalEntry['type'];
  }>({ open: false, editEntry: null, defaultType: 'deposit' });

  const todayDate = today();
  const savedCents = savedCentsOf(goal.id, entries);
  const pct = goalProgressPct(savedCents, goal.targetCents);
  const overdue = isOverdue(goal, savedCents, todayDate);
  const days = remainingDays(goal.deadline, todayDate);
  const excessCents = savedCents - goal.targetCents;
  const pace = paceText(paceForecast(goal, entries, todayDate));

  const daysText = days > 0 ? `剩余 ${days} 天` : days === 0 ? '今日截止' : `已到期 ${Math.abs(days)} 天`;

  const openEntryModal = (defaultType: GoalEntry['type'], editEntry: GoalEntry | null = null) => {
    setEntryModal({ open: true, editEntry, defaultType });
  };

  const handleAbandon = () => {
    Modal.confirm({
      title: `放弃目标「${goal.name}」？`,
      content: '放弃后目标转为「已放弃」并记录放弃日期，可随时重新开启。',
      okText: '放弃',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await abandonGoal(goal.id);
        message.success('已放弃该目标');
      },
    });
  };

  const handleReopen = () => {
    Modal.confirm({
      title: `重新开启目标「${goal.name}」？`,
      content: '重新开启后目标回到「进行中」，可继续记录存入。',
      okText: '重新开启',
      cancelText: '取消',
      onOk: async () => {
        await reopenGoal(goal.id);
        message.success('已重新开启');
      },
    });
  };

  const handleDelete = () => {
    Modal.confirm({
      title: `删除目标「${goal.name}」？`,
      // 删除范围明示记录条数（04 §2.6/§2.7）
      content: `该目标及其全部 ${entries.length} 条存入记录，删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await removeGoal(goal.id);
        message.success('已删除');
      },
    });
  };

  const handleToggleArchive = async () => {
    // 归档是独立管理标记，不改变状态（04 §2.6）
    await setArchived(goal.id, !goal.archived);
    message.success(goal.archived ? '已移回主列表' : '已归档');
  };

  const handleDeleteEntry = (entry: GoalEntry) => {
    Modal.confirm({
      title: '删除这条存入记录？',
      content: '删除后无法恢复，已储蓄金额与进度将即时重算。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await removeEntry(entry.id);
        message.success('已删除');
      },
    });
  };

  // 更多操作菜单（04 §2.2/§2.6）：已放弃显示「重新开启」且无直接编辑路径；归档区仅查看、取消归档、删除
  const canArchive = goal.status !== 'active';
  const menuItems: MenuAction[] = [];
  if (mode === 'archived') {
    menuItems.push({ key: 'unarchive', label: '取消归档', onClick: handleToggleArchive });
  } else if (goal.status === 'abandoned') {
    menuItems.push({ key: 'reopen', label: '重新开启', onClick: handleReopen });
    menuItems.push({
      key: 'archive',
      label: '归档',
      onClick: handleToggleArchive,
    });
  } else {
    menuItems.push({ key: 'edit', label: '编辑', onClick: () => onEditGoal(goal) });
    if (goal.status === 'active') {
      menuItems.push({ key: 'abandon', label: '放弃', danger: true, onClick: handleAbandon });
    }
    menuItems.push({
      key: 'archive',
      label: '归档',
      // 进行中（含逾期）不可归档，按钮置灰并提示原因（04 §2.6）
      disabled: !canArchive,
      tooltip: canArchive ? undefined : '仅已结束的目标可归档',
      onClick: handleToggleArchive,
    });
  }
  menuItems.push({ key: 'delete', label: '删除', danger: true, onClick: handleDelete });

  const entryColumns: ColumnsType<GoalEntry> = [
    { title: '日期', dataIndex: 'date', width: 110 },
    {
      title: '方向',
      dataIndex: 'type',
      width: 80,
      render: (v: GoalEntry['type']) =>
        v === 'deposit' ? <Tag color="green">存入</Tag> : <Tag color="red">取出</Tag>,
    },
    {
      title: '金额',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (v: number, r) => (
        <span style={{ color: r.type === 'deposit' ? '#2f7d5d' : '#cf1322' }}>
          {r.type === 'deposit' ? '+' : '-'}
          {formatYuan(v)}
        </span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'memo',
      ellipsis: true,
      render: (v: string | undefined) => v ?? '—',
    },
  ];
  if (mode !== 'archived') {
    entryColumns.push({
      title: '操作',
      width: 110,
      render: (_, record) => (
        <>
          <a onClick={() => openEntryModal(record.type, record)}>修改</a>
          <a style={{ marginLeft: 12, color: '#ff4d4f' }} onClick={() => handleDeleteEntry(record)}>
            删除
          </a>
        </>
      ),
    });
  }

  const sortedEntries = [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <Card
      size="small"
      // 逾期目标整卡警示高亮（04 §2.2/§2.5）
      style={overdue ? { borderColor: '#faad14' } : undefined}
      title={
        <Space size={8} wrap>
          <span>{goal.name}</span>
          {statusTag(goal.status)}
          {overdue && <Tag color="orange">已到期 {Math.abs(days)} 天</Tag>}
        </Space>
      }
      extra={
        <Space>
          {mode !== 'archived' && (
            <Button size="small" type="primary" onClick={() => openEntryModal('deposit')}>
              记一笔存入
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            dropdownRender={() => (
              <div
                style={{
                  width: 148,
                  padding: 4,
                  background: '#fff',
                  borderRadius: 8,
                  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
                }}
              >
                {menuItems.map((item) => {
                  const button = (
                    <Button
                      type="text"
                      block
                      size="small"
                      danger={item.danger}
                      disabled={item.disabled}
                      style={{ textAlign: 'left' }}
                      onClick={() => {
                        setMenuOpen(false);
                        item.onClick();
                      }}
                    >
                      {item.label}
                    </Button>
                  );
                  return item.tooltip ? (
                    // span 包一层：disabled 按钮收不到 hover，需由外层触发 Tooltip
                    <Tooltip key={item.key} title={item.tooltip}>
                      <span style={{ display: 'block' }}>{button}</span>
                    </Tooltip>
                  ) : (
                    <div key={item.key}>{button}</div>
                  );
                })}
              </div>
            )}
          >
            <Button size="small">
              更多操作 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
    >
      {/* 摘要区：点击展开 / 收起详情（04 §2.2） */}
      <div onClick={() => setExpanded((v) => !v)} style={{ cursor: 'pointer' }}>
        <Space size="large" wrap>
          <span>
            目标金额 <b>{formatYuan(goal.targetCents)}</b>
          </span>
          <span>
            已储蓄 <b>{formatYuan(savedCents)}</b>
          </span>
          {savedCents < goal.targetCents && (
            <Typography.Text type="secondary">还差 {formatYuan(goal.targetCents - savedCents)}</Typography.Text>
          )}
        </Space>
        <Progress percent={pct} status={goal.status === 'achieved' ? 'success' : 'normal'} />
        {/* 超额提示：¥X 为超出部分（04 §2.4/§2.5） */}
        {excessCents > 0 && (
          <Typography.Text type="warning">已超出目标金额 {formatYuan(excessCents)}</Typography.Text>
        )}
        <div>
          <Typography.Text type={overdue ? 'warning' : undefined}>{daysText}</Typography.Text>
        </div>
        {pace && (
          <div>
            <Typography.Text type="secondary">{pace}</Typography.Text>
          </div>
        )}
        {goal.status === 'achieved' && goal.achievedAt && (
          <div>
            <Typography.Text type="secondary">达成日期：{goal.achievedAt}</Typography.Text>
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          <Typography.Link>
            {expanded ? <CaretUpOutlined /> : <CaretDownOutlined />} {expanded ? '收起详情' : '展开详情'}
          </Typography.Link>
        </div>
      </div>

      {/* 逾期目标的三个明确选项（04 §2.5）：延期 / 放弃 / 继续跟进 */}
      {overdue && mode !== 'archived' && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="warning" style={{ display: 'block', marginBottom: 4 }}>
            目标日期已过但尚未达成，可选择：
          </Typography.Text>
          <Space>
            <Button size="small" onClick={() => onEditGoal(goal)}>
              延期
            </Button>
            <Button size="small" danger onClick={handleAbandon}>
              放弃
            </Button>
            {/* 继续跟进：不做任何操作，卡片持续显示已到期天数（04 §2.5） */}
            <Button size="small" onClick={() => undefined}>
              继续跟进
            </Button>
          </Space>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          {goal.note && (
            <div style={{ marginBottom: 8 }}>
              <Typography.Text type="secondary">备注：</Typography.Text>
              {goal.note}
            </div>
          )}
          {goal.status === 'achieved' && goal.achievedAt && (
            <div style={{ marginBottom: 8 }}>达成日期：{goal.achievedAt}</div>
          )}
          <Typography.Text strong>存入记录（{entries.length} 条）</Typography.Text>
          <Table<GoalEntry>
            style={{ marginTop: 8 }}
            rowKey="id"
            size="small"
            dataSource={sortedEntries}
            pagination={{ pageSize: 5, size: 'small', hideOnSinglePage: true }}
            columns={entryColumns}
            locale={{
              emptyText: <Empty description="暂无存入记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            }}
          />
          {mode !== 'archived' && (
            <Space style={{ marginTop: 8 }}>
              <Button size="small" onClick={() => openEntryModal('deposit')}>
                添加存入
              </Button>
              <Button size="small" onClick={() => openEntryModal('withdraw')}>
                添加取出
              </Button>
            </Space>
          )}
        </div>
      )}

      <GoalEntryModal
        open={entryModal.open}
        goal={goal}
        editEntry={entryModal.editEntry}
        defaultType={entryModal.defaultType}
        onCancel={() => setEntryModal((p) => ({ ...p, open: false }))}
        onSaved={() => setEntryModal((p) => ({ ...p, open: false }))}
      />
    </Card>
  );
}
