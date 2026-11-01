import { useEffect, useState } from 'react';
import { Button, Card, Collapse, Empty, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import GoalCard from '@/components/GoalCard';
import GoalFormModal from '@/components/GoalFormModal';
import { useGoalsStore } from '@/stores/useGoalsStore';
import { compareGoals } from '@/lib/goals';
import { today } from '@/lib/ids';
import type { SavingsGoal } from '@/lib/types';

/**
 * 储蓄目标页（04 §2.2～§2.7）：主列表 + 底部归档折叠区。
 * 储蓄目标是独立的攒钱计划，与账户/资产快照互不推导（01 §5.6）；
 * 本页不涉及投资内容，不展示投资类声明（04 §5 声明仅在配置教育模块）。
 */
export default function GoalsPage() {
  const { goals, entries, load } = useGoalsStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayDate = today();
  // 排序（04 §2.2）：逾期进行中置顶 → 进行中按目标日期近到远 → 已达成/已放弃沉底
  const unarchived = goals
    .filter((g) => !g.archived)
    .sort((a, b) => compareGoals(a, b, todayDate, entries));
  const archived = goals
    .filter((g) => g.archived)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));

  const openCreate = () => {
    setEditGoal(null);
    setFormOpen(true);
  };
  const openEdit = (goal: SavingsGoal) => {
    setEditGoal(goal);
    setFormOpen(true);
  };

  return (
    <Card
      title="储蓄目标"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建目标
        </Button>
      }
    >
      {goals.length === 0 ? (
        <Empty description="为你的下一个目标开始攒钱">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建目标
          </Button>
        </Empty>
      ) : (
        <>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {unarchived.length === 0 ? (
              <Empty description="暂无未归档的目标" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              unarchived.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  entries={entries.filter((e) => e.goalId === goal.id)}
                  onEditGoal={openEdit}
                />
              ))
            )}
          </Space>

          {/* 归档列表折叠入口（04 §2.2）：仅查看、取消归档、删除 */}
          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'archived',
                label: `已归档目标（${archived.length}）`,
                children:
                  archived.length === 0 ? (
                    <Empty description="暂无已归档目标" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {archived.map((goal) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          entries={entries.filter((e) => e.goalId === goal.id)}
                          mode="archived"
                          onEditGoal={openEdit}
                        />
                      ))}
                    </Space>
                  ),
              },
            ]}
          />
        </>
      )}

      <GoalFormModal
        open={formOpen}
        editGoal={editGoal}
        onCancel={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
    </Card>
  );
}
