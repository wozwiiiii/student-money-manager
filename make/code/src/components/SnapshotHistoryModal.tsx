import { Modal, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { formatYuan } from '@/lib/money';
import type { AssetSnapshot } from '@/lib/types';

/**
 * 快照历史列表（02 §3.4.4）：按快照时间倒序；展开明细（各账户余额、数据来源、最后编辑时间）；编辑、删除。
 */
interface SnapshotHistoryModalProps {
  open: boolean;
  onClose: () => void;
  onEdit: (snapshot: AssetSnapshot) => void;
}

export default function SnapshotHistoryModal({ open, onClose, onEdit }: SnapshotHistoryModalProps) {
  const { accounts, snapshots, removeSnapshot } = useAssetsStore();

  const accountName = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return '未知账户';
    return account.deletedAt ? `${account.name}（已删除）` : account.name;
  };

  const handleDelete = (snapshot: AssetSnapshot) => {
    Modal.confirm({
      title: '删除这条快照？',
      content:
        '删除后资产趋势图将减少对应记录点；若删除的是某账户最近一次快照，该账户「当前余额」将回退至更早一次快照的值；若为该账户唯一一次快照，该账户余额显示「—」并标「待录入快照」、不计入总资产。删除不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await removeSnapshot(snapshot.id);
        message.success('快照已删除');
      },
    });
  };

  return (
    <Modal title="快照历史" open={open} onCancel={onClose} footer={null} width={720}>
      <Table<AssetSnapshot>
        rowKey="id"
        dataSource={[...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt))}
        pagination={{ pageSize: 8, size: 'small' }}
        expandable={{
          expandedRowRender: (record) => (
            <div>
              {record.entries.map((e) => (
                <div key={e.accountId}>
                  {accountName(e.accountId)}：{formatYuan(e.balanceCents)}
                  {e.units != null && e.nav != null && (
                    <Typography.Text type="secondary">
                      {' '}
                     （份额 {e.units} × 净值 {e.nav}）
                    </Typography.Text>
                  )}
                </div>
              ))}
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                数据来源：手动录入
                {record.updatedAt && ` ｜ 最后编辑于 ${dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm')}`}
              </Typography.Paragraph>
            </div>
          ),
        }}
        columns={[
          {
            title: '快照时间',
            dataIndex: 'takenAt',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '总资产',
            dataIndex: 'totalCents',
            render: (v: number) => formatYuan(v),
          },
          {
            title: '操作',
            render: (_, record) => (
              <>
                <a onClick={() => onEdit(record)}>编辑</a>
                <a style={{ marginLeft: 12 }} onClick={() => handleDelete(record)}>
                  删除
                </a>
              </>
            ),
          },
        ]}
      />
    </Modal>
  );
}
