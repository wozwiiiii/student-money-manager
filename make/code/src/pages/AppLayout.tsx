import { Layout, Menu, Typography } from 'antd';
import {
  AccountBookOutlined,
  FundOutlined,
  PieChartOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Sider, Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/overview', icon: <WalletOutlined />, label: '资产总览' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户管理' },
  { key: '/transactions', icon: <AccountBookOutlined />, label: '收支记录' },
  { key: '/budget', icon: <PieChartOutlined />, label: '预算' },
  { key: '/goals', icon: <FundOutlined />, label: '储蓄目标' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
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
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
