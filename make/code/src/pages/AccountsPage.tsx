import { useMemo, useState } from 'react';
import { Button, Card, Drawer, Empty, List, Modal, Popover, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import AccountFormModal from '@/components/AccountFormModal';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { transactionsRepo } from '@/db/repositories';
import { ASSET_TYPE_ORDER, daysUntil } from '@/lib/assets';
import { formatYuan, sumCents } from '@/lib/money';
import { today } from '@/lib/ids';
import type { Account, AssetSnapshot, AssetType } from '@/lib/types';

/**
 * 账户管理页（02 §2）：按三类分组展示，组头含浅白说明与组内小计；卡片操作：详情/编辑/删除。
 * 删除规则（02 §2.4.7）：无数据一次确认；有快照或关联收支记录需勾选了解影响。
 */
export default function AccountsPage() {
  const { accounts, snapshots, latestEntryOf, removeAccount } = useAssetsStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [createType, setCreateType] = useState<AssetType>('cash');
  const [detail, setDetail] = useState<Account | null>(null);

  const openCreate = (type: AssetType) => {
    setEditing(null);
    setCreateType(type);
    setFormOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setFormOpen(true);
  };

  const handleDelete = async (account: Account) => {
    const snapshotCount = snapshots.filter((s) => s.entries.some((e) => e.accountId === account.id)).length;
    const relatedTx = (await transactionsRepo.all()).filter(
      (t) => t.accountId === account.id || t.counterAccountId === account.id,
    );

    if (snapshotCount === 0 && relatedTx.length === 0) {
      // 情形 1：无任何数据，确认一次即删（02 §2.4.7）
      Modal.confirm({
        title: `删除账户「${account.name}」？`,
        content: '删除后不可恢复。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => removeAccount(account.id),
      });
      return;
    }

    // 情形 2：有数据，逐条列明影响并勾选确认（02 §2.4.7）
    let checked = false;
    const modal = Modal.confirm({
      title: `删除账户「${account.name}」？`,
      content: (
        <div>
          <p>该账户已有数据，删除后：</p>
          <ul>
            <li>已有历史快照保持不变，趋势图历史记录点不变化；</li>
            <li>未来的新快照不再包含该账户；</li>
            <li>
              指向该账户的收支记录（{relatedTx.length} 笔）全部保留，「所属账户」显示原名称并标「已删除」；
            </li>
            <li>删除后不可恢复。</li>
          </ul>
          <label>
            <input
              type="checkbox"
              onChange={(e) => {
                checked = e.target.checked;
                modal.update({ okButtonProps: { danger: true, disabled: !checked } });
              }}
            />
            我已了解上述影响
          </label>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true, disabled: true },
      cancelText: '取消',
      onOk: () => removeAccount(account.id),
    });
  };

  return (
    <Card
      title="账户管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate('cash')}>
          添加账户
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <Empty description="还没有账户：添加账户后即可录入资产快照" />
      ) : (
        ASSET_TYPE_ORDER.map((group) => {
          const groupAccounts = accounts.filter((a) => a.assetType === group.key);
          const subtotal = sumCents(
            groupAccounts
              .filter((a) => a.includeInTotal && latestEntryOf(a.id) !== null)
              .map((a) => latestEntryOf(a.id)!.entry.balanceCents),
          );
          return (
            <div key={group.key} style={{ marginBottom: 24 }}>
              <Space style={{ marginBottom: 8 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {group.label}
                </Typography.Title>
                <Popover content={<div style={{ maxWidth: 320 }}>{group.explain}</div>} trigger="click">
                  <Typography.Link type="secondary">这是什么？</Typography.Link>
                </Popover>
                <Typography.Text type="secondary">小计 {formatYuan(subtotal)}</Typography.Text>
                <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(group.key)}>
                  添加
                </Button>
              </Space>
              <List
                grid={{ gutter: 12, xs: 1, sm: 2, lg: 3 }}
                dataSource={groupAccounts}
                renderItem={(account) => {
                  const latest = latestEntryOf(account.id);
                  return (
                    <List.Item>
                      <Card
                        size="small"
                        title={account.name}
                        extra={
                          <Space>
                            <a onClick={() => setDetail(account)}>详情</a>
                            <a onClick={() => openEdit(account)}>编辑</a>
                            <a style={{ color: '#ff4d4f' }} onClick={() => handleDelete(account)}>
                              删除
                            </a>
                          </Space>
                        }
                      >
                        <div>
                          {latest ? (
                            <Typography.Title level={4} style={{ margin: 0 }}>
                              {formatYuan(latest.entry.balanceCents)}
                            </Typography.Title>
                          ) : (
                            <Space>
                              <Typography.Title level={4} style={{ margin: 0 }}>
                                —
                              </Typography.Title>
                              <Tag>待录入快照</Tag>
                            </Space>
                          )}
                        </div>
                        <div>
                          {latest ? (
                            <Typography.Text type="secondary">
                              最近快照：{dayjs(latest.takenAt).format('YYYY-MM-DD HH:mm')}
                            </Typography.Text>
                          ) : (
                            <Typography.Text type="secondary">尚未录入快照</Typography.Text>
                          )}
                        </div>
                        {!account.includeInTotal && <Tag style={{ marginTop: 4 }}>不计入总资产</Tag>}
                        {account.assetType === 'fixed' && account.maturityDate && (
                          <div>
                            {daysUntil(account.maturityDate, today()) < 0 ? (
                              <Tag color="orange">已到期，请确认资金去向</Tag>
                            ) : (
                              <Typography.Text type="secondary">
                                到期日 {account.maturityDate}（剩 {daysUntil(account.maturityDate, today())} 天）
                              </Typography.Text>
                            )}
                          </div>
                        )}
                      </Card>
                    </List.Item>
                  );
                }}
              />
            </div>
          );
        })
      )}

      <AccountFormModal
        open={formOpen}
        account={editing}
        defaultAssetType={createType}
        onCancel={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />

      <Drawer
        title={detail ? `账户详情：${detail.name}` : ''}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={420}
      >
        {detail && <AccountDetail account={detail} snapshots={snapshots} />}
      </Drawer>
    </Card>
  );
}

function AccountDetail({ account, snapshots }: { account: Account; snapshots: AssetSnapshot[] }) {
  const history = useMemo(
    () =>
      snapshots
        .filter((s) => s.entries.some((e) => e.accountId === account.id))
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
        .map((s) => ({ takenAt: s.takenAt, entry: s.entries.find((e) => e.accountId === account.id)! })),
    [account.id, snapshots],
  );

  return (
    <div>
      <List>
        <List.Item>资产类型：{ASSET_TYPE_ORDER.find((t) => t.key === account.assetType)?.label}</List.Item>
        <List.Item>是否计入总资产：{account.includeInTotal ? '计入' : '不计入'}</List.Item>
        {account.assetType === 'fixed' && (
          <>
            <List.Item>本金：{account.principalCents != null ? formatYuan(account.principalCents) : '—'}</List.Item>
            <List.Item>存入/购买日期：{account.purchaseDate ?? '—'}</List.Item>
            <List.Item>期限：{account.termDays ? `${account.termDays} 天` : '—'}</List.Item>
            <List.Item>到期日：{account.maturityDate ?? '—'}</List.Item>
            <List.Item>
              展示收益率：{account.displayRatePercent != null ? `${account.displayRatePercent}%` : '—'}
              <Typography.Text type="secondary">（参考值而非承诺）</Typography.Text>
            </List.Item>
            <List.Item>
              风险等级：
              {account.riskLevel === 'unknown' || account.riskLevel == null
                ? '不确定'
                : { low: '低', mediumLow: '中低', medium: '中', mediumHigh: '中高', high: '高' }[account.riskLevel]}
            </List.Item>
          </>
        )}
        {account.assetType === 'fund' && <List.Item>基金名称：{account.fundName ?? '—'}</List.Item>}
        {account.note && <List.Item>备注：{account.note}</List.Item>}
        <List.Item>创建时间：{dayjs(account.createdAt).format('YYYY-MM-DD HH:mm')}</List.Item>
      </List>
      <Typography.Title level={5}>历次快照值</Typography.Title>
      {history.length === 0 ? (
        <Typography.Text type="secondary">尚无快照记录</Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={history}
          renderItem={({ takenAt, entry }) => (
            <List.Item>
              {dayjs(takenAt).format('YYYY-MM-DD HH:mm')}：{formatYuan(entry.balanceCents)}
              {entry.units != null && entry.nav != null && (
                <Typography.Text type="secondary">
                  （份额 {entry.units} × 净值 {entry.nav}）
                </Typography.Text>
              )}
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
