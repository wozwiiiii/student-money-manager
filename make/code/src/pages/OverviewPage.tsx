import { Card, Empty, Typography } from 'antd';
import { useEffect } from 'react';
import { useAssetsStore } from '@/stores/useAssetsStore';

/** 资产总览（02 号文档）：阶段 2 仅实现空数据首次使用态；总资产/账户结构/趋势图在阶段 3 实现 */
export default function OverviewPage() {
  const { accounts, snapshots, load } = useAssetsStore();

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = accounts.length === 0;

  return (
    <Card title="资产总览">
      {isEmpty ? (
        <>
          <Empty
            description="还没有任何账户：添加账户并录入当前余额，即可看到你的总资产与账户结构"
            style={{ margin: '48px 0' }}
          />
          <Typography.Paragraph type="secondary">
            提示：账户是资金存放渠道的记账容器（如"余额宝""银行卡"）；录入余额后会生成你的第一条资产快照。
          </Typography.Paragraph>
        </>
      ) : (
        <Typography.Paragraph type="secondary">
          账户已就绪（{accounts.length} 个），快照 {snapshots.length} 条。总资产、账户结构与资产趋势图将在阶段
          3 实现。
        </Typography.Paragraph>
      )}
    </Card>
  );
}
