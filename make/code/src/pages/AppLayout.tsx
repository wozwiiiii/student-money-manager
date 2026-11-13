import { useEffect } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  AccountBookOutlined,
  BookOutlined,
  FundOutlined,
  PieChartOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BackupReminderBanner from '@/components/BackupReminderBanner';
import FirstUseNotice from '@/components/FirstUseNotice';
import { useAppStore } from '@/stores/useAppStore';
import { useSyncStore } from '@/stores/useSyncStore';

const { Sider, Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/overview', icon: <WalletOutlined />, label: '资产总览' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户管理' },
  { key: '/transactions', icon: <AccountBookOutlined />, label: '收支记录' },
  { key: '/budget', icon: <PieChartOutlined />, label: '预算' },
  { key: '/goals', icon: <FundOutlined />, label: '储蓄目标' },
  { key: '/education', icon: <BookOutlined />, label: '配置教育' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const loadApp = useAppStore((s) => s.load);
  useEffect(() => {
    // 全局横切状态（首次告知 08 §7、备份提醒 08 §3.3）依赖应用状态，布局层统一加载
    void loadApp();
    // 已登录则恢复登录态并做一次云同步（08 §9.2 应用打开时自动拉取）
    void useSyncStore.getState().restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64} theme="light">
        <div style={{ padding: 16, fontWeight: 600, fontSize: 16 }}>校园理财管家</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', paddingInline: 24 }}>
          <Typography.Text type="secondary">
            本地存储 · 数据不出本地 · 教育性信息，不构成投资建议
          </Typography.Text>
        </Header>
        {/* 定期备份提醒条（08 §3.3）：页面顶部非阻断提示 */}
        <BackupReminderBanner />
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
        {/* 首次使用告知层（08 §7）：确认后不再出现 */}
        <FirstUseNotice />
      </Layout>
    </Layout>
  );
}
