import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Popover, Segmented, Space, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import TrendChart from '@/components/TrendChart';
import SnapshotFormModal from '@/components/SnapshotFormModal';
import SnapshotHistoryModal from '@/components/SnapshotHistoryModal';
import { useAssetsStore } from '@/stores/useAssetsStore';
import {
  ASSET_TYPE_ORDER,
  computeCurrentTotalCents,
  daysUntil,
  trendPoints,
  type TrendRange,
} from '@/lib/assets';
import { formatYuan, sumCents } from '@/lib/money';
import { today } from '@/lib/ids';
import type { Account, AssetSnapshot } from '@/lib/types';

/**
 * 资产总览页（02 §5）：总资产卡片、账户结构、资产趋势图、不计入账户区、空态引导。
 * 页面只读展示；所有数字来自用户录入的资产快照，标注最近快照时间，不出现「实时余额」字样。
 */
export default function OverviewPage() {
  const { accounts, snapshots, latestEntryOf, load } = useAssetsStore();
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<AssetSnapshot | null>(null);
  const [trendRange, setTrendRange] = useState<TrendRange>('all');

  useEffect(() => {
    void load();
  }, [load]);

  const snapshotsAsc = useMemo(
    () => [...snapshots].sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
    [snapshots],
  );
  const latestSnapshot = snapshotsAsc[snapshotsAsc.length - 1];
  const totalCents = computeCurrentTotalCents(accounts, snapshotsAsc);
  const allExcluded = accounts.length > 0 && accounts.every((a) => !a.includeInTotal);
  const noSnapshot = snapshotsAsc.length === 0;
  const trendData = trendPoints(snapshotsAsc, trendRange, new Date().toISOString());

  const openSnapshot = () => {
    if (accounts.length === 0) {
      message.info('请先创建账户');
      return;
    }
    setEditSnapshot(null);
    setSnapshotOpen(true);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 总资产卡片（02 §5.2） */}
      <Card>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space>
            <Typography.Text type="secondary">当前总资产</Typography.Text>
            {latestSnapshot && (
              <Typography.Text type="secondary">
                最近快照：{dayjs(latestSnapshot.takenAt).format('M 月 D 日 HH:mm')}
              </Typography.Text>
            )}
          </Space>
          {noSnapshot ? (
            <Space direction="vertical">
              <Typography.Title level={2} style={{ margin: 0 }}>
                录入首次快照后显示总资产
              </Typography.Title>
              <Button type="primary" onClick={openSnapshot}>
                录入首次快照
              </Button>
            </Space>
          ) : (
            <Typography.Title level={2} style={{ margin: 0 }}>
              {formatYuan(totalCents)}
            </Typography.Title>
          )}
          {allExcluded && (
            <Typography.Text type="warning">
              当前没有计入总资产的账户，请检查设置
            </Typography.Text>
          )}
          <Space wrap>
            <Button type="primary" onClick={openSnapshot}>
              更新快照
            </Button>
            <Link to="/accounts">
              <Button>管理账户</Button>
            </Link>
            <Button onClick={() => setHistoryOpen(true)}>快照历史</Button>
            <Button disabled title="账单导入将在阶段 4 开放">
              导入账单
            </Button>
          </Space>
        </Space>
      </Card>

      {/* 空态引导（02 §5.7/5.8、01 场景 6） */}
      {accounts.length === 0 && (
        <Card>
          <Empty description="从创建第一个账户开始：登记你放钱的地方（如「余额宝」「银行卡」），再录入当前余额">
            <Link to="/accounts">
              <Button type="primary">创建第一个账户</Button>
            </Link>
          </Empty>
          <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
            三步开始：① 创建账户 → ② 录入第一次快照 → ③ 之后每周花一分钟更新快照，即可看到资产变化。
          </Typography.Paragraph>
        </Card>
      )}

      {/* 账户结构（02 §5.4.2） */}
      {accounts.length > 0 &&
        ASSET_TYPE_ORDER.map((group) => {
          const groupAccounts = accounts.filter((a) => a.assetType === group.key);
          if (groupAccounts.length === 0) return null;
          const included = groupAccounts.filter((a) => a.includeInTotal);
          const subtotal = sumCents(
            included
              .filter((a) => latestEntryOf(a.id) !== null)
              .map((a) => latestEntryOf(a.id)!.entry.balanceCents),
          );
          const percent = totalCents > 0 ? Math.round((subtotal / totalCents) * 100) : null;
          return (
            <Card
              key={group.key}
              title={
                <Space>
                  {group.label}
                  <Popover content={<div style={{ maxWidth: 320 }}>{group.explain}</div>} trigger="click">
                    <Typography.Link type="secondary">这是什么？</Typography.Link>
                  </Popover>
                  <Typography.Text type="secondary">
                    小计 {formatYuan(subtotal)}
                    {percent !== null && ` ｜ 占 ${percent}%`}
                  </Typography.Text>
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {groupAccounts.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </Space>
            </Card>
          );
        })}

      {/* 不计入总资产的账户（02 §5.2） */}
      {accounts.some((a) => !a.includeInTotal) && (
        <Card title="未计入总资产的账户">
          <Space direction="vertical">
            {accounts
              .filter((a) => !a.includeInTotal)
              .map((account) => (
                <Typography.Text key={account.id}>
                  {account.name}：{formatBalance(latestEntryOf(account.id)?.entry.balanceCents)}
                  <Tag style={{ marginLeft: 8 }}>未计入总资产</Tag>
                </Typography.Text>
              ))}
          </Space>
        </Card>
      )}

      {/* 资产趋势图（02 §5.4.3） */}
      {accounts.length > 0 && (
        <Card
          title="资产趋势"
          extra={
            <Segmented
              value={trendRange}
              onChange={(v) => setTrendRange(v as TrendRange)}
              options={[
                { label: '全部', value: 'all' },
                { label: '近 1 个月', value: '1m' },
                { label: '近 3 个月', value: '3m' },
              ]}
            />
          }
        >
          {snapshotsAsc.length === 0 ? (
            <Empty description="完成首次快照后，这里将记录你的资产变化">
              <Button onClick={openSnapshot}>去录入快照</Button>
            </Empty>
          ) : snapshotsAsc.length === 1 ? (
            <Empty description="已有 1 次快照，再更新一次即可看到资产趋势">
              <Button onClick={openSnapshot}>更新快照</Button>
            </Empty>
          ) : (
            <TrendChart points={trendData} />
          )}
        </Card>
      )}

      <SnapshotFormModal
        open={snapshotOpen}
        editSnapshot={editSnapshot}
        onCancel={() => setSnapshotOpen(false)}
        onSaved={() => setSnapshotOpen(false)}
      />
      <SnapshotHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onEdit={(snapshot) => {
          setHistoryOpen(false);
          setEditSnapshot(snapshot);
          setSnapshotOpen(true);
        }}
      />
    </Space>
  );
}

function formatBalance(cents: number | null | undefined): string {
  return cents != null ? formatYuan(cents) : '—';
}

function AccountRow({ account }: { account: Account }) {
  const { latestEntryOf } = useAssetsStore();
  const latest = latestEntryOf(account.id);
  return (
    <Space wrap>
      <Typography.Text strong>{account.name}</Typography.Text>
      {latest ? (
        <Typography.Text>{formatYuan(latest.entry.balanceCents)}</Typography.Text>
      ) : (
        <>
          <Typography.Text>—</Typography.Text>
          <Tag>待录入快照</Tag>
        </>
      )}
      {account.assetType === 'fixed' && (
        <>
          {account.maturityDate && (
            <Typography.Text type="secondary">
              到期日 {account.maturityDate}
              {daysUntil(account.maturityDate, today()) < 0 ? (
                <Tag color="orange" style={{ marginLeft: 8 }}>
                  已到期，请确认资金去向
                </Tag>
              ) : (
                `（剩 ${daysUntil(account.maturityDate, today())} 天）`
              )}
            </Typography.Text>
          )}
          {account.displayRatePercent != null && (
            <Typography.Text type="secondary">
              展示收益率 {account.displayRatePercent}%
              <Tag style={{ marginLeft: 4 }}>参考值而非承诺</Tag>
            </Typography.Text>
          )}
        </>
      )}
      {account.assetType === 'fund' && latest && latest.entry.units != null && latest.entry.nav != null && (
        <Typography.Text type="secondary">
          份额 {latest.entry.units} × 净值 {latest.entry.nav}
        </Typography.Text>
      )}
    </Space>
  );
}
